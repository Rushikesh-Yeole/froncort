'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent } from '@tiptap/react'
import { Editor } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import Mention from '@tiptap/extension-mention'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableCell from '@tiptap/extension-table-cell'
import TableHeader from '@tiptap/extension-table-header'
import Placeholder from '@tiptap/extension-placeholder'
import axios from 'axios'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { diffWords } from 'diff'

const API = 'http://localhost:5000/api'
const YJS = 'ws://localhost:1234'

// Axios interceptor
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

// === ROBUST BASE64 HELPERS ===

/**
 * Encodes a Uint8Array into a base64 string.
 * This is a robust way to handle binary data in the browser.
 * @param {Uint8Array} bytes - The binary data to encode.
 * @returns {string} The base64-encoded string.
 */
function uint8ArrayToBase64(bytes) {
  const CHUNK_SIZE = 0x8000; // 32k chunks
  const chunks = [];
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    // Use subarray and String.fromCharCode.apply to handle large arrays
    chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE)));
  }
  return btoa(chunks.join(''));
}

/**
 * Decodes a base64 string into a Uint8Array.
 * This is the reverse of uint8ArrayToBase64.
 * @param {string} base64 - The base64-encoded string.
 * @returns {Uint8Array} The decoded binary data.
 */
function base64ToUint8Array(base64) {
  try {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  } catch (error) {
    console.error("Failed to decode base64 string:", error);
    return new Uint8Array(0);
  }
}


// === ICON BUTTON ===
const IconBtn = ({ icon, onClick, active, tip, disabled }) => (
  <button
    onClick={onClick}
    title={tip}
    disabled={disabled}
    className={`px-3 py-1.5 rounded-md text-sm transition-all ${
      active 
        ? 'bg-blue-100 text-blue-700 font-medium' 
        : 'text-gray-700 hover:bg-gray-100'
    } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
  >
    {icon}
  </button>
)

// === TOOLBAR ===
function Toolbar({ editor }) {
  if (!editor) return null

  return (
    <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white sticky top-0 z-10">
      <div className="flex items-center gap-1">
        <IconBtn 
          icon={<span className="font-bold">B</span>} 
          onClick={() => editor.chain().focus().toggleBold().run()} 
          active={editor.isActive('bold')} 
          tip="Bold" 
        />
        <IconBtn 
          icon={<span className="italic">I</span>} 
          onClick={() => editor.chain().focus().toggleItalic().run()} 
          active={editor.isActive('italic')} 
          tip="Italic" 
        />
        <IconBtn 
          icon={<span className="line-through">S</span>} 
          onClick={() => editor.chain().focus().toggleStrike().run()} 
          active={editor.isActive('strike')} 
          tip="Strike" 
        />
      </div>
      
      <div className="w-px h-6 bg-gray-300" />
      
      <div className="flex items-center gap-1">
        <IconBtn 
          icon="H1" 
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} 
          active={editor.isActive('heading', { level: 1 })} 
          tip="Heading 1" 
        />
        <IconBtn 
          icon="H2" 
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} 
          active={editor.isActive('heading', { level: 2 })} 
          tip="Heading 2" 
        />
      </div>
      
      <div className="w-px h-6 bg-gray-300" />
      
      <div className="flex items-center gap-1">
        <IconBtn 
          icon="• List" 
          onClick={() => editor.chain().focus().toggleBulletList().run()} 
          active={editor.isActive('bulletList')} 
          tip="Bullet List" 
        />
        <IconBtn 
          icon="☑ Todo" 
          onClick={() => editor.chain().focus().toggleTaskList().run()} 
          active={editor.isActive('taskList')} 
          tip="Todo List" 
        />
        <IconBtn 
          icon="Table" 
          onClick={() => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()} 
          tip="Insert Table" 
        />
        <IconBtn 
          icon="@" 
          onClick={() => editor.chain().focus().insertContent('@').run()} 
          tip="Mention" 
        />
      </div>
    </div>
  )
}

// === SHARE DIALOG ===
function ShareDialog({ project, onClose, onRefresh }) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('viewer')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleShare = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      await axios.post(`${API}/projects/${project._id}/share`, { email, role })
      setSuccess(`✓ Shared with ${email}`)
      setEmail('')
      setTimeout(() => {
        setSuccess('')
        onRefresh()
      }, 2000)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to share')
    } finally {
      setLoading(false)
    }
  }

  const handleRemove = async (userId) => {
    if (!confirm('Remove this collaborator?')) return
    try {
      await axios.delete(`${API}/projects/${project._id}/collaborators/${userId}`)
      onRefresh()
    } catch (err) {
      alert('Failed to remove collaborator')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-6" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-900">Share "{project.name}"</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        <form onSubmit={handleShare} className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium mb-2 text-gray-700">Invite by email</label>
            <div className="flex gap-2">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colleague@example.com"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
              </select>
            </div>
          </div>

          {error && <div className="text-red-600 text-sm bg-red-50 p-3 rounded-lg">{error}</div>}
          {success && <div className="text-green-600 text-sm bg-green-50 p-3 rounded-lg">{success}</div>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors font-medium"
          >
            {loading ? 'Inviting...' : 'Send Invite'}
          </button>
        </form>

        <div className="border-t pt-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-3">People with access</h4>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div>
                <div className="font-medium text-sm">{project.ownerId?.name || 'Owner'}</div>
                <div className="text-xs text-gray-500">{project.ownerId?.email}</div>
              </div>
              <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded font-medium">Owner</span>
            </div>

            {project.collaborators?.map((collab) => (
              <div key={collab.userId._id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div className="font-medium text-sm">{collab.userId.name}</div>
                  <div className="text-xs text-gray-500">{collab.userId.email}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-2 py-1 rounded font-medium ${
                    collab.role === 'editor' 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-gray-200 text-gray-700'
                  }`}>
                    {collab.role}
                  </span>
                  <button
                    onClick={() => handleRemove(collab.userId._id)}
                    className="text-red-500 hover:text-red-700 text-xs"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// === SIDEBAR ===
function Sidebar({ 
  projects, 
  selectedProject, 
  selectedPage, 
  onProjectSelect, 
  onPageSelect, 
  onNewProject, 
  onNewPage, 
  onLogout, 
  onShareProject, 
  onDeleteProject, 
  onDeletePage, 
  collapsed, 
  onToggle, 
  currentUser 
}) {
  const [expandedProjects, setExpandedProjects] = useState([])

  const toggleProject = (id) => {
    setExpandedProjects(prev =>
      prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]
    )
  }

  const isOwner = (project) => {
    if (!project || !currentUser) return false;
    return project.ownerId?._id === currentUser?.id || project.ownerId === currentUser?.id
  }

  return (
    <aside className={`bg-gray-900 text-white flex flex-col transition-all duration-300 ${collapsed ? 'w-16' : 'w-72'} h-screen`}>
      <div className="p-4 flex items-center justify-between border-b border-gray-700">
        {!collapsed && <h2 className="text-lg font-bold">Froncort</h2>}
        <button 
          onClick={onToggle} 
          className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
        >
          {collapsed ? '→' : '←'}
        </button>
      </div>

      {!collapsed && (
        <>
          <div className="p-3">
            <button 
              onClick={onNewProject} 
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium text-sm"
            >
              + New Project
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {projects.map(proj => {
              const isExp = expandedProjects.includes(proj._id)
              const owner = isOwner(proj)
              
              return (
                <div key={proj._id} className="mb-1">
                  <div
                    className={`group p-2.5 rounded-lg cursor-pointer transition-all ${
                      selectedProject === proj._id 
                        ? 'bg-gray-800' 
                        : 'hover:bg-gray-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div 
                        className="flex items-center flex-1 gap-2 min-w-0"
                        onClick={() => {
                          toggleProject(proj._id)
                          onProjectSelect(proj._id)
                        }}
                      >
                        <span className="text-gray-400 text-xs">{isExp ? '▼' : '▶'}</span>
                        <span className="font-medium text-sm truncate flex-1">{proj.name}</span>
                        {owner && <span className="text-yellow-400 text-xs">👑</span>}
                      </div>
                      
                      {owner && (
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={(e) => { e.stopPropagation(); onShareProject(proj._id) }}
                            className="p-1.5 hover:bg-gray-700 rounded text-xs"
                          >
                            🔗
                          </button>
                          <button
                            onClick={(e) => { 
                              e.stopPropagation(); 
                              if(confirm(`Delete "${proj.name}"?`)) onDeleteProject(proj._id) 
                            }}
                            className="p-1.5 hover:bg-red-600 rounded text-xs"
                          >
                            🗑️
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {isExp && (
                    <div className="ml-6 mt-1 space-y-0.5">
                      <button
                        onClick={() => onNewPage(proj._id)}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-gray-800/50 rounded"
                      >
                        + New Page
                      </button>

                      {proj.pages?.map(page => (
                        <div
                          key={page._id}
                          className={`group px-3 py-2 rounded cursor-pointer text-sm flex justify-between items-center ${
                            selectedPage === page._id 
                              ? 'bg-blue-600 text-white' 
                              : 'text-gray-300 hover:bg-gray-800/50'
                          }`}
                        >
                          <span 
                            onClick={() => onPageSelect(page._id, proj._id)} 
                            className="flex-1 truncate"
                          >
                            📄 {page.title || 'Untitled'}
                          </span>
                          {owner && (
                            <button
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                if(confirm(`Delete "${page.title}"?`)) onDeletePage(page._id, proj._id) 
                              }}
                              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-600 rounded text-xs"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          <div className="p-1 mb-12 border-t border-gray-700">
            <div className="flex items-center gap-2 px-2 mb-2">
              <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold text-sm">
                {currentUser?.name?.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{currentUser?.name}</div>
                <div className="text-xs text-gray-400 truncate">{currentUser?.email}</div>
              </div>
            </div>
            <button 
              onClick={onLogout} 
              className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg text-sm font-medium"
            >
              Logout
            </button>
          </div>
        </>
      )}
    </aside>
  )
}

// === VERSIONS PANEL ===
function VersionsPanel({ pageId, onClose, user, editor }) {
  const [versions, setVersions] = useState([])
  const [compare, setCompare] = useState(null)

  useEffect(() => {
    if (!pageId) return
    axios.get(`${API}/pages/${pageId}/versions`)
      .then(r => setVersions(r.data))
      .catch(console.error)
  }, [pageId])

  const jsonToText = (node) => {
    if (!node) return ''
    if (Array.isArray(node)) return node.map(jsonToText).join('')
    if (node.type === 'text') return node.text || ''
    if (node.content) return node.content.map(jsonToText).join('\n')
    return ''
  }

  const esc = (s) => (s || '').replace(/[&<"']/g, m => ({'&':'&amp;','<':'&lt;','"':'&quot;',"'":'&#039;'}[m]))

  const handleCompare = async (vid) => {
    try {
      const { data } = await axios.get(`${API}/pages/${pageId}/versions/${vid}`)
      const vText = jsonToText(data.contentJSON)
      const cText = jsonToText(editor?.getJSON() || {})
      const diffs = diffWords(vText, cText)
      const html = diffs.map(p => {
        if (p.added) return `<span class="bg-green-200 px-1 rounded">${esc(p.value)}</span>`
        if (p.removed) return `<span class="bg-red-200 line-through px-1 rounded">${esc(p.value)}</span>`
        return `<span>${esc(p.value)}</span>`
      }).join('')
      setCompare(html)
    } catch (e) {
      console.error(e)
    }
  }

  const handleRestore = async (vid) => {
    if (!confirm('Restore this version?')) return
    try {
      await axios.post(`${API}/pages/${pageId}/versions/${vid}/restore`, { author: user.name })
      alert('Version restored!')
      window.location.reload()
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-xl font-bold">Version History</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {versions.map((v, idx) => (
            <div key={v._id} className="p-4 bg-gray-50 rounded-lg border">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded font-medium">
                      {idx === 0 ? 'Latest' : `${idx} ago`}
                    </span>
                    <span className="font-semibold text-sm">{v.author}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {new Date(v.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleCompare(v._id)} 
                    className="px-3 py-1.5 text-xs bg-white border rounded-lg hover:bg-gray-50"
                  >
                    Compare
                  </button>
                  <button 
                    onClick={() => handleRestore(v._id)} 
                    className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Restore
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {compare && (
          <div className="border-t p-5 bg-gray-50">
            <div className="font-semibold text-sm mb-3">Diff View</div>
            <div className="p-4 bg-white rounded-lg border text-sm overflow-auto max-h-60" 
                 dangerouslySetInnerHTML={{ __html: compare }} />
          </div>
        )}
      </div>
    </div>
  )
}

// === MAIN ===
export default function Tiptap() {
  const [projects, setProjects] = useState([])
  const [selectedProject, setSelectedProject] = useState(null)
  const [selectedPage, setSelectedPage] = useState(null)
  const [title, setTitle] = useState('')
  const [status, setStatus] = useState('Ready')
  const [saving, setSaving] = useState(false)
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [shareDialogProject, setShareDialogProject] = useState(null)
  const [currentUser, setCurrentUser] = useState(null)

  const editorRef = useRef(null)
  const ydocRef = useRef(null)
  const providerRef = useRef(null)
  const persistenceRef = useRef(null)
  const syncedRef = useRef(false)

  const user = useMemo(() => {
    const stored = localStorage.getItem('user')
    if (stored) {
      const parsed = JSON.parse(stored)
      return {
        name: parsed.name,
        color: `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`
      }
    }
    return { name: 'Anonymous', color: '#999' }
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) {
      window.location.href = '/auth'
      return
    }

    const stored = localStorage.getItem('user')
    if (stored) setCurrentUser(JSON.parse(stored))

    loadProjects()
  }, [])

  const loadProjects = useCallback(async () => {
    try {
      const { data } = await axios.get(`${API}/projects`)
      
      const projectsWithPages = await Promise.all(
        data.map(async (proj) => {
          try {
            const { data: pages } = await axios.get(`${API}/pages?projectId=${proj._id}`)
            return { ...proj, pages }
          } catch (e) {
            console.error("Failed to load pages for project", proj._id, e);
            return { ...proj, pages: [] }
          }
        })
      )
      
      setProjects(projectsWithPages)
    } catch (e) {
      console.error(e)
      if (e.response?.status === 401) {
        window.location.href = '/auth'
      }
    }
  }, [])

  const cleanup = useCallback(() => {
    try {
      providerRef.current?.disconnect()
      persistenceRef.current?.destroy?.()
      ydocRef.current?.destroy?.()
      editorRef.current?.destroy?.()
      providerRef.current = null
      persistenceRef.current = null
      ydocRef.current = null
      editorRef.current = null
      syncedRef.current = false
    } catch (e) {
      console.error('Cleanup error:', e)
    }
  }, [])

  const createProvider = useCallback((room) => {
  try {
    providerRef.current?.disconnect()
    persistenceRef.current?.destroy?.()
    ydocRef.current?.destroy?.()
  } catch (e) {}

  ydocRef.current = new Y.Doc()
  
  const token = localStorage.getItem('token')
  providerRef.current = new WebsocketProvider(YJS, room, ydocRef.current, { 
    params: { token },
    connect: true
  })
  providerRef.current.awareness.setLocalStateField('user', user)

  console.log('[Provider] 🔌 Created for:', room)
  return { ydoc: ydocRef.current, provider: providerRef.current }
}, [user])

const createEditor = useCallback(() => {
  try { editorRef.current?.destroy() } catch (e) {}

  const ydoc = ydocRef.current
  if (!ydoc) {
    console.error("[Editor] Cannot create editor: Y.Doc is missing.");
    return
  }

  editorRef.current = new Editor({
    extensions: [
      StarterKit.configure({ history: false }),
      Collaboration.configure({ document: ydoc }),
      CollaborationCursor.configure({ 
        provider: providerRef.current,
        user: user
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Mention.configure({
        HTMLAttributes: { class: 'mention' },
        suggestion: {
          items: ({ query }) => ['Aman', 'Priya', 'Rohan', 'Sarah']
            .filter(n => n.toLowerCase().startsWith(query.toLowerCase()))
            .slice(0, 5)
        }
      }),
      Placeholder.configure({ placeholder: 'Start typing...' })
    ]
  })

  console.log('[Editor] ✅ Created!')
  return editorRef.current
}, [user])

const save = useCallback(async () => {
  if (!editorRef.current || !title || !selectedProject) {
    alert('Please enter a title')
    return
  }

  setSaving(true)
  setStatus('💾 Saving...')

  try {
    const content = editorRef.current.getJSON()
    
    console.log('[Save] 📝 Saving page...', { title, selectedPage })
    
    // Step 1: Save page metadata and create version
    const { data } = await axios.post(`${API}/pages`, {
      id: selectedPage,
      title,
      content, // This creates the version
      projectId: selectedProject,
      author: user.name
    })

    console.log('[Save] ✅ Page saved:', data._id)
    const pageId = selectedPage || data._id

    // Step 2: If new page, update state and reconnect
    if (!selectedPage) {
      setSelectedPage(data._id)
      
      // Reconnect provider to the *real* page ID
      cleanup()
      const { ydoc } = createProvider(data._id)
      
      // We must re-create the editor for the new Y.Doc
      createEditor() 
      
      setTimeout(() => {
        if (editorRef.current && content) {
          // This ensures the new Y.Doc (for the real ID)
          // has the content from the temp Y.Doc
          editorRef.current.commands.setContent(content, true)
          
          // Now, immediately save the Y.js state for this new page
          if (ydocRef.current) {
            const yjsState = Y.encodeStateAsUpdate(ydocRef.current)
            // Use the robust base64 encoder
            const yjsBase64 = uint8ArrayToBase64(yjsState)
            
            console.log('[Save] 💾 Persisting Yjs state for new page...')
            axios.post(`${API}/pages/${pageId}/yjs`, {
              yjsBase64,
              contentJSON: content, // Also update JSON snapshot
              author: user.name
            }).then(() => {
              console.log('[Save] ✅ Yjs state persisted for new page')
            }).catch(e => {
              console.error('[Save] ❌ Yjs persist failed for new page:', e)
            })
          }
        }
      }, 500)
    
    } else {
      // Step 3: Persist Yjs binary state for *existing* page
      if (ydocRef.current) {
        const yjsState = Y.encodeStateAsUpdate(ydocRef.current)
        // Use the robust base64 encoder
        const yjsBase64 = uint8ArrayToBase64(yjsState)
        
        console.log('[Save] 💾 Persisting Yjs state...')
        await axios.post(`${API}/pages/${pageId}/yjs`, {
          yjsBase64,
          contentJSON: content, // Also update JSON snapshot
          author: user.name
        })
        console.log('[Save] ✅ Yjs state persisted')
      }
    }

    await loadProjects()
    setStatus('✅ Saved')
    setTimeout(() => setStatus('Ready'), 2000)
  } catch (e) {
    console.error('[Save] ❌ Error:', e)
    setStatus('❌ Save failed')
    alert(e.response?.data?.error || 'Save failed')
  } finally {
    setSaving(false)
  }
}, [title, selectedPage, selectedProject, user, cleanup, createProvider, createEditor, loadProjects])

  // --- MODIFIED OPEN FUNCTION ---
  const open = useCallback(async (id, projectId) => {
    setStatus('Loading...')
    cleanup()

    try {
      // Step 1: Get Page metadata (for title) and Y.js state (for content)
      // We run these in parallel for speed.
      const [{ data: page }, { data: yjsData }] = await Promise.all([
        axios.get(`${API}/pages/${id}`),
        axios.get(`${API}/pages/${id}/yjs`) // <-- Fetch the persisted Y.js state
      ]);

      setTitle(page.title || '')
      setSelectedPage(page._id)
      setSelectedProject(projectId)

      // Step 2: Create provider and a new, empty Y.Doc
      const { provider, ydoc } = createProvider(id);
      
      // Step 3: Apply persisted Y.js state if it exists
      if (yjsData.yjsBase64) {
        console.log('[Open] Applying persisted Yjs state...');
        try {
          // Use the robust base64 decoder
          const yjsState = base64ToUint8Array(yjsData.yjsBase64);
          if (yjsState.length > 0) {
            Y.applyUpdate(ydoc, yjsState); // Apply the saved state to our new Y.Doc
            console.log('[Open] ✅ Yjs state applied');
          } else {
            console.log('[Open] Yjs state was empty, starting fresh.');
          }
        } catch (e) {
          console.error('[Open] ❌ Failed to apply Yjs state:', e);
        }
      } else {
        console.log('[Open] No persisted Yjs state found, starting fresh.');
      }

      // Step 4: Wait for provider to sync (fetches any *newer* changes from websocket server)
      await new Promise((resolve) => {
        let synced = false
        const onSync = (isSynced) => {
          if (isSynced && !synced) {
            synced = true
            console.log('[Provider] ✅ Synced!')
            provider.off('sync', onSync)
            resolve()
          }
        }
        provider.on('sync', onSync)
        
        // Timeout to prevent getting stuck
        setTimeout(() => {
          if (!synced) {
            console.warn('[Provider] ⚠️ Sync timeout')
            synced = true
            provider.off('sync', onSync)
            resolve()
          }
        }, 3000)
      })
      
      // Step 5: NOW create the editor, which will use the populated Y.Doc
      createEditor()
      setStatus('✅ Ready')
    } catch (e) {
      console.error('[Open] ❌ Failed:', e)
      setStatus('❌ Load failed')
      if (e.response?.status === 403) {
        alert('Access denied')
      }
    }
  }, [cleanup, createProvider, createEditor])
  // --- END MODIFIED OPEN FUNCTION ---

  const newPage = useCallback((projectId) => {
  if (!projectId) {
    alert('Select a project first')
    return
  }
  cleanup()
  setTitle('')
  setSelectedPage(null)
  setSelectedProject(projectId)
  
  // A temporary room ID for the new page until it's saved
  const tempId = `temp-${Date.now()}`
  createProvider(tempId)
  createEditor()
  setStatus('📝 New page')
}, [cleanup, createProvider, createEditor]) 

  const newProject = useCallback(async () => {
    const name = prompt('Project name:')
    if (!name?.trim()) return

    try {
      await axios.post(`${API}/projects`, { name: name.trim() })
      await loadProjects()
    } catch (e) {
      alert('Failed to create project')
    }
  }, [loadProjects])

  const deleteProject = useCallback(async (id) => {
    try {
      await axios.delete(`${API}/projects/${id}`)
      await loadProjects()
      if (selectedProject === id) {
        cleanup()
        setSelectedProject(null)
        setSelectedPage(null)
        setTitle('')
      }
    } catch (e) {
      alert('Failed to delete')
    }
  }, [loadProjects, selectedProject, cleanup])

  const deletePage = useCallback(async (pageId, projectId) => {
    try {
      await axios.delete(`${API}/pages/${pageId}`)
      await loadProjects()
      if (selectedPage === pageId) {
        cleanup()
        setSelectedPage(null)
        setTitle('')
        setStatus('Ready')
      }
    } catch (e) {
      alert('Failed to delete')
    }
  }, [loadProjects, selectedPage, cleanup])

  const handleShareProject = useCallback(async (projectId) => {
    try {
      const { data } = await axios.get(`${API}/projects/${projectId}`)
      setShareDialogProject(data)
    } catch (e) {
      alert('Failed to load project')
    }
  }, [])

  const refreshShareDialog = useCallback(async () => {
    if (shareDialogProject) {
      try {
        const { data } = await axios.get(`${API}/projects/${shareDialogProject._id}`)
        setShareDialogProject(data)
      } catch (e) {
        console.error(e)
      }
    }
  }, [shareDialogProject])

  const logout = useCallback(() => {
    if (confirm('Logout?')) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      cleanup()
      window.location.href = '/auth'
    }
  }, [cleanup])

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <Sidebar 
        projects={projects} 
        selectedProject={selectedProject}
        selectedPage={selectedPage}
        onProjectSelect={setSelectedProject}
        onPageSelect={open}
        onNewProject={newProject}
        onNewPage={newPage}
        onLogout={logout}
        onShareProject={handleShareProject}
        onDeleteProject={deleteProject}
        onDeletePage={deletePage}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        currentUser={currentUser}
      />

      <main className="flex-1 flex flex-col bg-white overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 bg-white">
          { <div className="flex items-center justify-between gap-4">
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Page title"
              className="flex-1 text-2xl font-bold outline-none text-gray-900 placeholder-gray-300"
              disabled={!selectedPage && !selectedProject}
            />
            
            <div className="flex items-center gap-2">
              {selectedPage && (
                <button
                  onClick={() => setVersionsOpen(true)}
                  className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors font-medium"
                >
                  🕐 History
                </button>
              )}
              <button
                onClick={save}
                disabled={saving || !selectedProject || !title}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium shadow-sm"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>}
        </div>

        {/* Toolbar */}
        <Toolbar editor={editorRef.current} />

        {/* Editor Area */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          {editorRef.current ? (
            <div className="max-w-5xl mx-auto px-8 py-8 min-h-full">
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 min-h-[calc(100vh-240px)]">
                <EditorContent editor={editorRef.current} />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="text-6xl mb-4">📝</div>
                <h3 className="text-xl font-semibold text-gray-700 mb-2">
                  {status.includes('Loading') ? 'Loading...' : 'No document open'}
                </h3>
                <p className="text-gray-500">
                  {status.includes('Loading') ? 'Please wait...' : 'Select a Project/page or create a new one'}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 mb-12 py-2 border-t border-gray-200 bg-white flex items-center justify-between text-xs">
          <div className="flex items-center gap-4">
            <span className={`font-medium ${
              status.includes('✓') ? 'text-green-600' : 
              status.includes('✗') ? 'text-red-600' : 
              'text-gray-500'
            }`}>
              {status}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span style={{ color: user.color }} className="text-lg">●</span>
            <span className="text-gray-600">{user.name}</span>
          </div>
        </div>
      </main>

      {/* Modals */}
      {versionsOpen && selectedPage && (
        <VersionsPanel 
          pageId={selectedPage} 
          onClose={() => setVersionsOpen(false)} 
          user={user}
          editor={editorRef.current}
        />
      )}

      {shareDialogProject && (
        <ShareDialog 
          project={shareDialogProject} 
          onClose={() => setShareDialogProject(null)}
          onRefresh={refreshShareDialog}
        />
      )}

      <style jsx global>{`
        /* Custom Scrollbar */
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
          height: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: #4b5563;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: #6b7280;
        }

        /* Editor Styles */
        .ProseMirror {
          outline: none;
          min-height: 500px;
          font-size: 16px;
          line-height: 1.75;
          color: #1f2937;
        }
        
        .ProseMirror p.is-editor-empty:first-child::before {
          color: #9ca3af;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }

        /* Headings */
        .ProseMirror h1 {
          font-size: 2.25rem;
          font-weight: 700;
          margin: 2rem 0 1rem;
          color: #111827;
          line-height: 1.2;
        }
        .ProseMirror h2 {
          font-size: 1.875rem;
          font-weight: 600;
          margin: 1.75rem 0 0.875rem;
          color: #111827;
          line-height: 1.3;
        }
        .ProseMirror h3 {
          font-size: 1.5rem;
          font-weight: 600;
          margin: 1.5rem 0 0.75rem;
          color: #111827;
          line-height: 1.4;
        }

        /* Lists */
        .ProseMirror ul {
          list-style: disc;
          padding-left: 1.75rem;
          margin: 1rem 0;
        }
        .ProseMirror ol {
          list-style: decimal;
          padding-left: 1.75rem;
          margin: 1rem 0;
        }
        .ProseMirror li {
          margin: 0.5rem 0;
        }
        .ProseMirror li p {
          margin: 0;
        }

        /* Task List */
        ul[data-type="taskList"] {
          list-style: none;
          padding: 0;
        }
        li[data-type="taskItem"] {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
        }
        li[data-type="taskItem"] > label {
          flex: 0 0 auto;
          margin-top: 0.25rem;
          user-select: none;
        }
        li[data-type="taskItem"] > div {
          flex: 1 1 auto;
        }

        /* Table */
        .ProseMirror table {
          border-collapse: collapse;
          table-layout: fixed;
          width: 100%;
          margin: 1.5rem 0;
          overflow: hidden;
        }
        .ProseMirror td,
        .ProseMirror th {
          min-width: 1em;
          border: 2px solid #e5e7eb;
          padding: 0.75rem;
          vertical-align: top;
          box-sizing: border-box;
          position: relative;
        }
        .ProseMirror th {
          font-weight: 600;
          text-align: left;
          background-color: #f9fafb;
        }
        .ProseMirror .selectedCell {
          background-color: #dbeafe;
        }

        /* Mention */
        .mention {
          background: #dbeafe;
          color: #1e40af;
          padding: 0.1rem 0.5rem;
          border-radius: 0.375rem;
          font-weight: 500;
          white-space: nowrap;
        }

        /* Text Formatting */
        .ProseMirror strong {
          font-weight: 700;
        }
        .ProseMirror em {
          font-style: italic;
        }
        .ProseMirror code {
          background: #f3f4f6;
          padding: 0.2rem 0.4rem;
          border-radius: 0.25rem;
          font-size: 0.875em;
          font-family: 'Courier New', monospace;
        }
        .ProseMirror pre {
          background: #1f2937;
          color: #f9fafb;
          padding: 1rem;
          border-radius: 0.5rem;
          overflow-x: auto;
          margin: 1rem 0;
        }
        .ProseMirror pre code {
          background: none;
          padding: 0;
          color: inherit;
        }

        /* Blockquote */
        .ProseMirror blockquote {
          padding-left: 1.5rem;
          border-left: 4px solid #e5e7eb;
          margin: 1.5rem 0;
          font-style: italic;
          color: #4b5563;
        }

        /* Horizontal Rule */
        .ProseMirror hr {
          border: none;
          border-top: 2px solid #e5e7eb;
          margin: 2rem 0;
        }

        /* Selection */
        .ProseMirror ::selection {
          background: #bfdbfe;
        }

        /* Collaboration Cursors */
        .collaboration-cursor__caret {
          position: relative;
          margin-left: -1px;
          margin-right: -1px;
          border-left: 1px solid #0d0d0d;
          border-right: 1px solid #0d0d0d;
          word-break: normal;
          pointer-events: none;
        }
        .collaboration-cursor__label {
          position: absolute;
          top: -1.4em;
          left: -1px;
          font-size: 12px;
          font-style: normal;
          font-weight: 600;
          line-height: normal;
          user-select: none;
          color: #fff;
          padding: 0.1rem 0.3rem;
          border-radius: 3px 3px 3px 0;
          white-space: nowrap;
        }
      `}</style>
    </div>
  )
}