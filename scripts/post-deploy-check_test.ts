import { assertStringIncludes } from "jsr:@std/assert@1";
import { checkDeployedSite } from "./post-deploy-check.ts";

Deno.test("post-deploy-check fails when headers are wrong", async () => {
  const server = Deno.serve({ hostname: "127.0.0.1", port: 0 }, (request) => {
    const path = new URL(request.url).pathname;
    if (path === "/sw.js") {
      return new Response("<html></html>", {
        headers: { "content-type": "text/html", "cache-control": "max-age=60" },
      });
    }
    if (path === "/assets/app-abc.js") {
      return new Response("console.log(1)", {
        headers: {
          "content-type": "text/javascript",
          "cache-control": "no-cache",
        },
      });
    }
    if (path === "/f/x/s/y/messages") {
      return new Response("missing", {
        status: 404,
        headers: { "content-type": "text/plain" },
      });
    }
    return new Response(
      '<html><script src="/assets/app-abc.js"></script></html>',
      {
        headers: {
          "content-type": "text/html",
          "cache-control": "max-age=3600",
        },
      },
    );
  });

  try {
    const port = server.addr.port;
    const result = await checkDeployedSite(`http://127.0.0.1:${port}`);
    if (result.ok) throw new Error("expected the stub to fail");
    const joined = result.errors.join("\n");
    assertStringIncludes(joined, "no-cache");
    assertStringIncludes(joined, "JavaScript");
    assertStringIncludes(joined, "deep link");
    assertStringIncludes(joined, "nosniff");
  } finally {
    await server.shutdown();
  }
});
