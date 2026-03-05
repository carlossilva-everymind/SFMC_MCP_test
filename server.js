import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import axios from "axios";
import http from "http";
import { WebSocketServer } from "ws";

const port = process.env.PORT || 3000;

/* ================================
   HTTP SERVER (Required by Heroku)
================================ */
const httpServer = http.createServer((req, res) => {
  res.writeHead(200);
  res.end("MCP WebSocket Server Running");
});

/* ================================
   MCP SERVER
================================ */
const mcpServer = new Server(
  {
    name: "sfmc-mcp-server",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();

  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const response = await axios.post(
    `${process.env.SFMC_AUTH_URL}/v2/token`,
    {
      grant_type: "client_credentials",
      client_id: process.env.SFMC_CLIENT_ID,
      client_secret: process.env.SFMC_CLIENT_SECRET,
    }
  );

  cachedToken = response.data.access_token;
  tokenExpiresAt = now + response.data.expires_in * 1000 - 60000;

  return cachedToken;
}

/* ================================
   TOOL DEFINITIONS
================================ */

mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: "getContactByKey",
        description:
          "Retrieve a contact from a Data Extension by Contact Key",
        inputSchema: {
          type: "object",
          properties: {
            dataExtensionKey: { type: "string" },
            contactKey: { type: "string" },
          },
          required: ["dataExtensionKey", "contactKey"],
        },
      },
    ],
  };
});

mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "getContactByKey") {
    const { dataExtensionKey, contactKey } = request.params.arguments;

    const token = await getAccessToken();

    const url = `${process.env.SFMC_REST_URL}/data/v1/customobjectdata/key/${dataExtensionKey}/rowset?$filter=ContactKey eq '${contactKey}'`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response.data, null, 2),
        },
      ],
    };
  }

  throw new Error("Tool not found");
});

/* ================================
   WEBSOCKET SERVER
================================ */

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (socket) => {
  console.log("WebSocket client connected");

  socket.on("message", async (message) => {
    try {
      const request = JSON.parse(message.toString());

      const response = await mcpServer.handleRequest(request);

      socket.send(JSON.stringify(response));
    } catch (err) {
      socket.send(
        JSON.stringify({
          error: err.message,
        })
      );
    }
  });
});

/* ================================
   START SERVER
================================ */

httpServer.listen(port, () => {
  console.log(`Server running on port ${port}`);
});