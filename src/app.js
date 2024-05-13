const express = require("express");
const { createServer } = require("http");
const { Server } = require("socket.io");
const hbs = require("hbs");
const sqlite3 = require("sqlite3");
const { open } = require("sqlite");

async function main() {
  // open the db file
  const db = await open({
    filename: "chat.db",
    driver: sqlite3.Database,
  });

  // creating messages table
  await db.exec(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_offset TEXT UNIQUE,
    content TEXT
  );
  `);

  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    connectionStateRecovery: {},
  });

  app.set("view engine", hbs);
  app.use(express.static("public"));

  require("dotenv").config();
  const PORT = process.env.PORT || 3001;

  app.get("/", (req, res) => {
    res.render("index.hbs");
  });

  io.on("connection", async (socket) => {
    socket.on("chat message", async (msg, clientOffset, callback) => {
      let result;
      try {
        // store the messages in the db
        result = await db.run(
          "INSERT INTO messages (content, client_offset) VALUES (?, ?)",
          msg,
          clientOffset
        );
      } catch (e) {
        if (e.errno === 19) {
          // the message was already inserted, so we notify the client
          callback();
        } else {
          //
        }
        return;
      }
      // include the offset with the message
      io.emit("chat message", msg, result.lastID);
      // acknowledge the event
      callback();
    });

    if (!socket.recovered) {
      // if the connection state recovery was not successful
      try {
        await db.each(
          "SELECT id, content FROM messages WHERE id > ?",
          [socket.handshake.auth.serverOffset || 0],
          (_err, row) => {
            socket.emit("chat message", row.content, row.id);
          }
        );
      } catch (e) {
        console.error(e);
      }
    }
  });

  httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}...`);
  });
}

main();
