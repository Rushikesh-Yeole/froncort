"use client";
import { useEffect, useState, useMemo, useRef } from "react";
import { EditorContent } from "@tiptap/react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Collaboration from "@tiptap/extension-collaboration";
import CollaborationCursor from "@tiptap/extension-collaboration-cursor";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { useRouter } from "next/router";

export default function PageEditor() {
  const router = useRouter();
  const { pageId } = router.query;
  const [editor, setEditor] = useState(null);

  const user = useMemo(() => ({
    name: "User" + Math.floor(Math.random() * 1000),
    color: `#${Math.floor(Math.random() * 16777215)
      .toString(16)
      .padStart(6, "0")}`,
  }), []);

  useEffect(() => {
    if (!pageId) return;

    const ydoc = new Y.Doc();
    const provider = new WebsocketProvider(
      process.env.NEXT_PUBLIC_YJS_URL,
      pageId.toString(),
      ydoc
    );

    provider.awareness.setLocalStateField("user", user);

    const editorInstance = new Editor({
      extensions: [
        StarterKit.configure({ history: false }),
        Collaboration.configure({
          document: ydoc,
        }),
        CollaborationCursor.configure({
          provider: provider,
          user: user,
        }),
      ],
      content: "",
    });

    setEditor(editorInstance);

    return () => {
      editorInstance?.destroy();
      provider.disconnect();
    };
  }, [pageId, user]);

  if (!pageId || !editor) {
    return (
      <div className="p-6">
        <div className="border rounded-lg p-4 bg-gray-50">
          {!pageId ? "Loading..." : "Initializing editor..."}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h2 className="text-xl font-semibold mb-4">
        Collaborative Page: {pageId}
      </h2>
      <div className="mb-2 text-sm text-gray-600">
        Connected as: <span style={{ color: user.color }}>{user.name}</span>
      </div>
      <EditorContent 
        editor={editor} 
        className="border rounded-lg p-4 bg-white min-h-[400px] prose max-w-none" 
      />
    </div>
  );
}