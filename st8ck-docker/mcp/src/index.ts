import { Client } from "pg";
import http from "node:http";

const port = Number(process.env.MCP_PORT || 3333);

// connect DB
const db = new Client({
  connectionString: process.env.DATABASE_URL
});

await db.connect();

// simple API (mock MCP style)
const server = http.createServer(async (req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      service: "st8ck-mcp",
      db: "connected"
    }));
    return;
  }

  // 🔍 search products
  if (req.url?.startsWith("/search")) {
    const keyword = new URL(req.url, "http://localhost").searchParams.get("q") || "";

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
      [`%${keyword}%`]
    );

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result.rows));
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`st8ck MCP server running on port ${port}`);
});


// 📦 get product by code
if (req.url?.startsWith("/product")) {
  const code = new URL(req.url, "http://localhost").searchParams.get("code");

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

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result.rows[0] || null));
  return;
}

// ⚠️ low stock
if (req.url === "/low-stock") {
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

  res.writeHead(200, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result.rows));
  return;
}