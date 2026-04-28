import http from "node:http";

const port = Number(process.env.MCP_PORT || 3333);

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      service: "st8ck-mcp",
      db: process.env.DATABASE_URL ? "configured" : "missing"
    }));
    return;
  }

  res.writeHead(200, { "Content-Type": "text/plain" });
  res.end("st8ck MCP server running");
});

server.listen(port, "0.0.0.0", () => {
  console.log(`st8ck MCP server listening on port ${port}`);
});
