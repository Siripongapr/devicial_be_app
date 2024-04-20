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

app.use(authenticateToken);

app.get("/info", (req, res) => {
  res.json(req.user);
});

app.get("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out" });
});

app.post("/create-post", async (req, res) => {
  const { title, contents } = req.body;
  try {
    const post = await prisma.post.create({
      data: {
        title,
        user_id: req.user.id,
        date: new Date(),
      },
    });

    //TODO - find a better way to update contents

    const contentsArray = req.body.contents;
    const contents = contentsArray.map((content) => ({
      ...content,
      post_id: post.id,
    }));

    await Promise.all(
      contents.map(async (content) => {
        await prisma.content.create({
          data: content,
        });
      })
    );

    const postWithContents = await prisma.post.findUnique({
      where: {
        id: post.id,
      },
      include: {
        contents: true,
      },
    });

    res.json(postWithContents);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/posts", async (req, res) => {
  const posts = await prisma.post.findMany({
    include: {
      user: true,
      contents: true,
      comments: true,
      likes: true,
      views: true,
    },
  });

  res.json(posts);
});

app.get("/posts/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const post = await prisma.post.findUnique({
      where: {
        id: parseInt(id),
      },
      include: {
        user: true,
        contents: true,
        comments: true,
        likes: true,
        views: true,
      },
    });

    if (!post) {
      res.status(404).json({ error: "Post not found" });
      return;
    }

    const view = await prisma.postView.create({
      data: {
        post: { connect: { id: parseInt(id) } },
        viewer: { connect: { id: req.user.id } },
        created_at: new Date(),
      },
    });

    post.views.push(view);

    res.json(post);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.put("/posts/:id", async (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  try {
    const post = await prisma.post.update({
      where: {
        id: parseInt(id),
      },
      data: {
        title,
      },
    });

    const contentsArray = req.body.contents;
    const contents = contentsArray.map((content) => ({
      ...content,
      post_id: post.id,
    }));

    await prisma.content.deleteMany({
      where: {
        post_id: parseInt(id),
      },
    });

    //TODO - find a better way to update contents

    await Promise.all(
      contents.map(async (content) => {
        await prisma.content.create({
          data: content,
        });
      })
    );

    const postWithContents = await prisma.post.findUnique({
      where: {
        id: post.id,
      },
      include: {
        contents: true,
      },
    });

    res.json(postWithContents);
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.delete("/posts/:id", async (req, res) => {
  const { id } = req.params;
  try {
    // Delete related contents first
    await prisma.content.deleteMany({
      where: {
        post_id: parseInt(id),
      },
    });

    // Delete related comments
    await prisma.comment.deleteMany({
      where: {
        post_id: parseInt(id),
      },
    });

    // Delete related likes
    await prisma.postLike.deleteMany({
      where: {
        post_id: parseInt(id),
      },
    });

    // Delete related views
    await prisma.postView.deleteMany({
      where: {
        post_id: parseInt(id),
      },
    });

    // Finally, delete the post
    await prisma.post.delete({
      where: {
        id: parseInt(id),
      },
    });

    res.json({ message: "Post deleted" });
  } catch (error) {
    console.log(error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
