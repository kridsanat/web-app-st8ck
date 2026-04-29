import { Client } from "pg";
import http from "node:http";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Accept, Authorization, mcp-session-id, MCP-Session-Id, mcp-protocol-version"
  );
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id, MCP-Session-Id");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }
const port = Number(process.env.MCP_PORT || 3333);

const db = new Client({
  connectionString: process.env.DATABASE_URL
});
await db.connect();

const mcpServer = new McpServer({
  name: "st8ck-stock-mcp",
  version: "1.0.0"
});

mcpServer.tool(
  "search_products",
  "ค้นหาสินค้าจากชื่อสินค้า หรือรหัส SKU พร้อมจำนวนคงเหลือ",
  {
    q: z.string().describe("คำค้นหา เช่น SKU, กาแฟ, เสื้อ")
  },
  async ({ q }) => {
    const result = await db.query(
      `
      SELECT
        p.id,
        p.code,
        p.name,
        p.unit,
        p.sell_price,
        COALESCE(v.qty,0) AS stock_qty
      FROM products p
      LEFT JOIN v_stock v ON v.product_id = p.id
      WHERE p.is_active IS TRUE
        AND p.deleted_at IS NULL
        AND (p.name ILIKE $1 OR p.code ILIKE $1)
      ORDER BY p.name
      LIMIT 20
      `,
      [`%${q}%`]
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result.rows, null, 2)
        }
      ]
    };
  }
);

mcpServer.tool(
  "get_product_stock",
  "ดูข้อมูลสินค้าและจำนวน stock คงเหลือตามรหัสสินค้า",
  {
    code: z.string().describe("รหัสสินค้า เช่น SKU-1001")
  },
  async ({ code }) => {
    const result = await db.query(
      `
      SELECT
        p.id,
        p.code,
        p.name,
        p.unit,
        p.sell_price,
        p.min_qty_alert,
        COALESCE(v.qty,0) AS stock_qty
      FROM products p
      LEFT JOIN v_stock v ON v.product_id = p.id
      WHERE lower(p.code) = lower($1)
      LIMIT 1
      `,
      [code]
    );

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result.rows[0] || null, null, 2)
        }
      ]
    };
  }
);

mcpServer.tool(
  "get_low_stock_items",
  "ดูรายการสินค้าที่จำนวนคงเหลือต่ำกว่าหรือเท่ากับขั้นต่ำแจ้งเตือน",
  {},
  async () => {
    const result = await db.query(`
      SELECT
        p.code,
        p.name,
        p.min_qty_alert,
        COALESCE(v.qty,0) AS stock_qty
      FROM products p
      LEFT JOIN v_stock v ON v.product_id = p.id
      WHERE p.min_qty_alert > 0
        AND COALESCE(v.qty,0) <= p.min_qty_alert
      ORDER BY stock_qty ASC
    `);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result.rows, null, 2)
        }
      ]
    };
  }
);

const server = http.createServer(async (req, res) => {
  try {
    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        status: "ok",
        service: "st8ck-stock-mcp",
        db: "connected"
      }));
      return;
    }

    if (!req.url?.startsWith("/mcp")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not Found" }));
      return;
    }

    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    res.on("close", () => {
      transport.close();
    });

    await mcpServer.connect(transport);
    await transport.handleRequest(req, res);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
    }
    res.end(JSON.stringify({
      error: "Internal Server Error"
    }));
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`st8ck MCP server running on port ${port}`);
});
