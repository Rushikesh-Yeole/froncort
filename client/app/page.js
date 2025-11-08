'use client'
import dynamic from 'next/dynamic'
import './globals.css'

// load client component dynamically to avoid SSR issues
const Tiptap = dynamic(() => import('../components/Tiptap'), { ssr: false })

export default function Home() {
  return (
    <main style={{ padding: 28, maxWidth: 1100, margin: '0 auto' }}>

      <section style={{ background: '#fff', borderRadius: 12, boxShadow: '0 6px 20px rgba(0,0,0,0.06)', padding: 18 }}>
        <Tiptap />
      </section>

      <footer style={{ marginTop: 18, color: '#666', fontSize: 13 }}>
        Confluence style editor.
      </footer>
    </main>
  )
}