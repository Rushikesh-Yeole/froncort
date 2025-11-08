import jwt from 'jsonwebtoken';
import dotenv from "dotenv";

dotenv.config();
const JWT_SECRET = process.env.JWT_SECRET;
export const authenticate = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }
    const tokenParts = authHeader.split(' ');
    if (tokenParts.length !== 2 || tokenParts[0] !== 'Bearer') {
      return res.status(401).json({ error: 'Invalid token format. Must be Bearer token.' });
    }
    const token = tokenParts[1];
    const decodedPayload = jwt.verify(token, JWT_SECRET);
    req.userId = decodedPayload.userId; 
    next();
  } catch (ex) {
    console.error("Authentication error:", ex.message);
    res.status(401).json({ error: 'Invalid token.' });
  }
};