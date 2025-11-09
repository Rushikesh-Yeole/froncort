import './globals.css'
export const metadata = {
  title: 'Froncort',
  description: 'Confluence style editor',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'Inter, system-ui, sans-serif' }}>
        {children}
      </body>
    </html>
  )
}