import http from "http";
import { WebSocketServer } from "ws";
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET;
const server = http.createServer();
const wss = new WebSocketServer({ server });

// Connect to MongoDB
await mongoose.connect(process.env.MONGO_URI);
const Page = (await import('./models/Page.js')).default;
const Project = (await import('./models/Project.js')).default;
console.log('[Y.js Server] Connected to MongoDB');

const docs = new Map();
const awareness = new Map();
const pendingSaves = new Map();

const MSG_SYNC = 0;
const MSG_AWARENESS = 1;

async function checkAccess(pageId, userId) {
  try {
    const page = await Page.findById(pageId, 'projectId');
    if (!page) return false;
    const project = await Project.findById(page.projectId, 'ownerId collaborators');
    if (!project) return false;
    const isOwner = project.ownerId.toString() === userId;
    const isCollaborator = project.collaborators.some(c => c.userId.toString() === userId);
    return isOwner || isCollaborator;
  } catch (e) {
    console.error('[Access Check] Error:', e);
    return false;
  }
}

async function getDoc(roomName) {
  let doc = docs.get(roomName);
  if (doc) {
    return doc;
  }

  doc = new Y.Doc();
  docs.set(roomName, doc);

  if (roomName.startsWith('temp-')) {
    return doc;
  }

  try {
    const page = await Page.findById(roomName, 'yjsState');
    if (page && page.yjsState && page.yjsState.length > 0) {
      const stateData = page.yjsState instanceof Buffer 
        ? new Uint8Array(page.yjsState) 
        : page.yjsState;
      Y.applyUpdate(doc, stateData);
    }
  } catch (e) {
    console.error(`[Y.js] Load failed for ${roomName}:`, e.message);
  }

  doc.on("update", (update, origin) => {
    if (pendingSaves.has(roomName)) {
      clearTimeout(pendingSaves.get(roomName));
    }
    pendingSaves.set(roomName, setTimeout(async () => {
      if (roomName.startsWith('temp-')) {
        pendingSaves.delete(roomName);
        return;
      }
      try {
        const state = Y.encodeStateAsUpdate(doc);
        const bufferState = Buffer.from(state);
        await Page.findByIdAndUpdate(roomName, { 
          yjsState: bufferState,
          updatedAt: new Date()
        });
        pendingSaves.delete(roomName);
      } catch (e) {
        console.error(`[Y.js] Auto-save failed:`, e.message);
      }
    }, 2000));
  });

  return doc;
}

wss.on("connection", async (conn, req) => {
  const url = new URL(req.url, `ws://${req.headers.host}`);
  const roomName = url.pathname.slice(1).split("?")[0] || "default";
  const token = url.searchParams.get('token');

  conn.clientID = Math.floor(Math.random() * 0xFFFFFFFF);

  if (!roomName.startsWith('temp-')) {
    if (!token) {
      conn.close(4001, 'Authentication required');
      return;
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const hasAccess = await checkAccess(roomName, decoded.userId);
      if (!hasAccess) {
        conn.close(4003, 'Access denied');
        return;
      }
    } catch (e) {
      conn.close(4001, 'Invalid token');
      return;
    }
  }

  const doc = await getDoc(roomName);
  let aw = awareness.get(roomName);
  if (!aw) {
    aw = new awarenessProtocol.Awareness(doc);
    awareness.set(roomName, aw);
  }

  conn.binaryType = "arraybuffer";
  if (!doc._conns) doc._conns = new Set();
  doc._conns.add(conn);

  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, MSG_SYNC);
  syncProtocol.writeSyncStep1(encoder, doc);
  conn.send(encoding.toUint8Array(encoder));

  const states = aw.getStates();
  if (states.size > 0) {
    const enc2 = encoding.createEncoder();
    encoding.writeVarUint(enc2, MSG_AWARENESS);
    encoding.writeVarUint8Array(enc2, awarenessProtocol.encodeAwarenessUpdate(aw, Array.from(states.keys())));
    conn.send(encoding.toUint8Array(enc2));
  }

  conn.on("message", (msg) => {
    try {
      const decoder = decoding.createDecoder(new Uint8Array(msg));
      const msgType = decoding.readVarUint(decoder);

      if (msgType === MSG_SYNC) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_SYNC);
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn);
        if (encoding.length(encoder) > 1) {
          conn.send(encoding.toUint8Array(encoder));
        }
      } else if (msgType === MSG_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(aw, decoding.readVarUint8Array(decoder), conn);
      }
    } catch (err) {
      console.error('[WS] Message error:', err);
    }
  });

  const broadcastUpdate = (update, origin) => {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_SYNC);
    syncProtocol.writeUpdate(encoder, update);
    const message = encoding.toUint8Array(encoder);
    
    doc._conns.forEach((c) => {
      if (c !== origin && c.readyState === 1) {
        try {
          c.send(message);
        } catch (err) {
          console.error('[Broadcast] Send error:', err);
        }
      }
    });
  };
  doc.on("update", broadcastUpdate);

  const broadcastAwareness = ({ added, updated, removed }) => {
    const changed = added.concat(updated).concat(removed);
    if (changed.length === 0) return;
    
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MSG_AWARENESS);
    encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(aw, changed));
    const message = encoding.toUint8Array(encoder);
    
    doc._conns.forEach((c) => {
      if (c.readyState === 1) {
        try {
          c.send(message);
        } catch (err) {
          console.error('[Awareness] Send error:', err);
        }
      }
    });
  };
  aw.on("update", broadcastAwareness);

  //cleanup on disconnect
  conn.on("close", () => {
    doc._conns.delete(conn);
    doc.off("update", broadcastUpdate);
    aw.off("update", broadcastAwareness);
    
    awarenessProtocol.removeAwarenessStates(aw, [conn.clientID], null);
    
    if (doc._conns.size === 0) {
      if (pendingSaves.has(roomName)) {
        clearTimeout(pendingSaves.get(roomName));
        pendingSaves.delete(roomName);
      }
      
      if (!roomName.startsWith('temp-')) {
        const state = Y.encodeStateAsUpdate(doc);
        const bufferState = Buffer.from(state);
        Page.findByIdAndUpdate(roomName, { 
          yjsState: bufferState,
          updatedAt: new Date()
        })
        .then(() => console.log(`[Y.js] Final save for ${roomName}`))
        .catch(err => console.error(`[Y.js] Final save failed:`, err.message));
      }
      
      setTimeout(() => {
        if (doc._conns.size === 0) {
          docs.delete(roomName);
          awareness.delete(roomName);
        }
      }, 5 * 60 * 1000);
    }
  });

  conn.on("error", (err) => {
    console.error(`[WS] Connection error:`, err.message);
  });
});

const PORT = 1234;
server.listen(PORT, () => console.log(`Y.js WebSocket server running on ${PORT}`));