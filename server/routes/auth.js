import express from 'express'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import User from '../models/User.js'
import dotenv from "dotenv";
dotenv.config();

const router = express.Router()
const JWT_SECRET = process.env.JWT_SECRET;

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body
    if (!name || !email || !password) return res.status(400).json({ error: 'All fields required.' })

    const existing = await User.findOne({ email })
    if (existing) return res.status(400).json({ error: 'Email already registered.' })

    const hashed = await bcrypt.hash(password, 10)
    const user = await User.create({ name, email, password: hashed })

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' })
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body
    if (!email || !password) return res.status(400).json({ error: 'Missing fields' })

    const user = await User.findOne({ email })
    if (!user) return res.status(400).json({ error: 'Invalid credentials' })

    const match = await bcrypt.compare(password, user.password)
    if (!match) return res.status(400).json({ error: 'Invalid credentials' })

    const token = jwt.sign({ userId: user._id }, JWT_SECRET, { expiresIn: '7d' })
    res.json({ token, user: { id: user._id, name: user.name, email: user.email } })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Server error' })
  }
})

export default router
