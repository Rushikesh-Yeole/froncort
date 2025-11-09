import express from 'express'
import mongoose from 'mongoose'
import dotenv from 'dotenv'
import cors from 'cors'

import pagesRouter from './routes/pages.js'
import projectsRouter from './routes/projects.js'
import authRouter from './routes/auth.js'

dotenv.config()
const app = express()

app.use(cors())
app.use(express.json())

app.use('/auth', authRouter)

app.use('/pages', pagesRouter)
app.use('/projects', projectsRouter)

const PORT = process.env.PORT || 5000
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected')
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`))
  })
  .catch(err => console.error('MongoDB connection error:', err))
