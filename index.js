const express = require("express");
const jwt = require("jsonwebtoken");
const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT || "your_jwt";

// Middleware
app.use(express.json());

// Routes
app.get("/", async (req, res) => {
  res.json({ message: "Welcome to the API" });
});

// Routes
app.get("/", async (req, res) => {
  const users = await prisma.user.findMany();
  res.json(users);
});

app.post("/register", async (req, res) => {
  const { username, password, email, gender, birth_date } = req.body;
  try {
    // Check if username or email already exists
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ username: { equals: username } }, { email: { equals: email } }],
      },
    });

    if (existingUser) {
      res.status(400).json({ error: "Username or email already exists" });
      return;
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
        email,
        gender,
        birth_date,
      },
    });
    res.json(user);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post("/login", async (req, res) => {
  const { username, password } = req.body;
  try {
    // Check if user exists
    const user = await prisma.user.findFirst({
      where: { username },
    });

    if (!user) {
      res.status(400).json({ error: "User not found" });
      return;
    }

    // Validate password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      res.status(400).json({ error: "Invalid password" });
      return;
    }

    // Generate JWT token
    const token = jwt.sign({ ...user }, JWT_SECRET, { expiresIn: "7d" }); // replace 'your_jwt_secret_key' with your secret key

    res.cookie("token", token, { httpOnly: true });

    res.json({ token });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

function authenticateToken(req, res, next) {
  const token = req.headers.cookie;
  if (token == null) return res.sendStatus(401); // if there isn't any token

  jwt.verify(token.split("=")[1], JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next(); // pass the execution off to whatever request the client intended
  });
}

app.get("/info", authenticateToken, (req, res) => {
  res.json(req.user);
});

app.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out" });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
