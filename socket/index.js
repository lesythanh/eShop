const socketIO = require("socket.io");
const http = require("http");
const express = require("express");
const cors = require("cors");
const app = express();
const server = http.createServer(app);

// Improved CORS configuration for socket.io
const io = socketIO(server, {
  cors: {
    origin: "*", // Allow connections from any origin
    methods: ["GET", "POST"],
    credentials: true,
  },
  maxHttpBufferSize: 5e6, // Increase buffer size to 5MB for larger images
});

require("dotenv").config({
  path: "./.env",
});

app.use(cors());
app.use(express.json({ limit: "5mb" })); // Increase JSON size limit

app.get("/", (req, res) => {
  res.send("Hello world from socket server!");
});

let users = [];

const addUser = (userId, socketId) => {
  !users.some((user) => user.userId === userId) &&
    users.push({ userId, socketId });
};

const removeUser = (socketId) => {
  users = users.filter((user) => user.socketId !== socketId);
};

const getUser = (receiverId) => {
  return users.find((user) => user.userId === receiverId);
};

// Improved message object creation with structured image data
const createMessage = ({ senderId, receiverId, text, images }) => ({
  senderId,
  receiverId,
  text: text || "",
  images: images || null,
  seen: false,
  createdAt: Date.now(),
});

io.on("connection", (socket) => {
  // when connect
  console.log(`a user is connected with socket id: ${socket.id}`);

  // take userId and socketId from user
  socket.on("addUser", (userId) => {
    if (userId) {
      console.log(`User ${userId} connected with socket ${socket.id}`);
      addUser(userId, socket.id);
      io.emit("getUsers", users);
    }
  });

  // send and get message
  const messages = {}; // Object to track messages sent to each user

  socket.on("sendMessage", ({ senderId, receiverId, text, images }) => {
    if (!senderId || !receiverId) {
      console.log("Missing sender or receiver ID");
      return;
    }

    console.log(`Message from ${senderId} to ${receiverId}`);

    // Create a properly structured message
    const message = createMessage({
      senderId,
      receiverId,
      text,
      images,
    });

    const user = getUser(receiverId);

    if (!user) {
      console.log(`User ${receiverId} not found or offline`);
      // Store message anyway for later delivery
    }

    // Store the messages in the `messages` object
    if (!messages[receiverId]) {
      messages[receiverId] = [message];
    } else {
      messages[receiverId].push(message);
    }

    // send the message to the receiver if they're online
    if (user?.socketId) {
      console.log(`Sending message to socket ${user.socketId}`);
      io.to(user.socketId).emit("getMessage", message);
    }
  });

  socket.on("messageSeen", ({ senderId, receiverId, messageId }) => {
    const user = getUser(senderId);

    // update the seen flag for the message
    if (messages[senderId]) {
      const message = messages[senderId].find(
        (message) => message.receiverId === receiverId && message.id === messageId
      );
      if (message) {
        message.seen = true;

        // send a message seen event to the sender
        if (user?.socketId) {
          io.to(user.socketId).emit("messageSeen", {
            senderId,
            receiverId,
            messageId,
          });
        }
      }
    }
  });

  // update and get last message
  socket.on("updateLastMessage", ({ lastMessage, lastMessageId }) => {
    io.emit("getLastMessage", {
      lastMessage,
      lastMessageId,
    });
  });

  //when disconnect
  socket.on("disconnect", () => {
    console.log(`User disconnected with socket id: ${socket.id}`);
    removeUser(socket.id);
    io.emit("getUsers", users);
  });
});

server.listen(process.env.PORT || 4000, () => {
  console.log(`Server is running on port ${process.env.PORT || 4000}`);
});
