import { Server } from "@modelcontextprotocol/sdk/server";
import axios from "axios";

const server = new Server({
  name: "sfmc-mcp-server",
  version: "1.0.0",
});

let cachedToken = null;
let tokenExpiresAt = 0;

// 🔐 Get OAuth Token
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

// 🛠 MCP Tool
server.tool(
  "getContactByKey",
  {
    description: "Retrieve a contact from a Data Extension by Contact Key",
    inputSchema: {
      type: "object",
      properties: {
        dataExtensionKey: { type: "string" },
        contactKey: { type: "string" },
      },
      required: ["dataExtensionKey", "contactKey"],
    },
  },
  async ({ dataExtensionKey, contactKey }) => {
    const token = await getAccessToken();

    const url = `${process.env.SFMC_REST_URL}/data/v1/customobjectdata/key/${dataExtensionKey}/rowset?$filter=ContactKey eq '${contactKey}'`;

    const response = await axios.get(url, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    return response.data;
  }
);

server.start();