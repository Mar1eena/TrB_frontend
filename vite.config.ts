import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const protoJs = path.resolve(frontendDir, "../TrB_proto/gen/js-ts");

const protoModules = [
  "@marleena/trb-proto/api/tinvest/common_pb",
  "@marleena/trb-proto/api/tinvest/users_pb",
  "@marleena/trb-proto/api/tinvest/UsersServiceClientPb",
  "@marleena/trb-proto/api/tinvest/instruments_pb",
  "@marleena/trb-proto/api/tinvest/InstrumentsServiceClientPb",
  "@marleena/trb-proto/api/tinvest/marketdata_pb",
  "@marleena/trb-proto/api/tinvest/MarketdataServiceClientPb",
  "@marleena/trb-proto/api/tinvest/operations_pb",
  "@marleena/trb-proto/api/tinvest/OperationsServiceClientPb",
  "@marleena/trb-proto/api/tinvest/orders_pb",
  "@marleena/trb-proto/api/tinvest/OrdersServiceClientPb",
  "@marleena/trb-proto/api/tinvest/sandbox_pb",
  "@marleena/trb-proto/api/tinvest/SandboxServiceClientPb",
  "@marleena/trb-proto/api/tinvest/signals_pb",
  "@marleena/trb-proto/api/tinvest/SignalsServiceClientPb",
  "@marleena/trb-proto/api/tinvest/stoporders_pb",
  "@marleena/trb-proto/api/tinvest/StopordersServiceClientPb",
  "@marleena/trb-proto/nats/nats_pb",
  "@marleena/trb-proto/nats/NatsServiceClientPb",
  "@marleena/trb-proto/postgresql/postgresql_pb",
  "@marleena/trb-proto/postgresql/PostgresqlServiceClientPb",
  "@marleena/trb-proto/postgresql/admin_pb",
  "@marleena/trb-proto/postgresql/AdminServiceClientPb",
  "@marleena/trb-proto/test/test_pb",
  "@marleena/trb-proto/test/TestServiceClientPb",
  "@marleena/trb-proto/clickhouse/admin_pb",
  "@marleena/trb-proto/clickhouse/AdminServiceClientPb",
  "@marleena/trb-proto/clickhouse/clickhouse_pb",
  "@marleena/trb-proto/clickhouse/ClickhouseServiceClientPb",
  "@marleena/trb-proto/indicators/indicators_pb",
  "@marleena/trb-proto/indicators/IndicatorsServiceClientPb",
  "@marleena/trb-proto/google/api/annotations_pb",
  "@marleena/trb-proto/google/api/http_pb",
  "@marleena/trb-proto/google/api/field_behavior_pb",
];

const protoPanelFiles = [
  "./src/main.tsx",
  "./src/App.tsx",
  "./src/components/ServiceTree/ServiceTree.tsx",
  "./src/components/NatsAdminPanel/NatsAdminPanel.tsx",
  "./src/components/ClickHouseManagerPanel/ClickHouseManagerPanel.tsx",
  "./src/components/PostgresManagerPanel/PostgresManagerPanel.tsx",
  "./src/components/SchedulerPanel/SchedulerPanel.tsx",
  "./src/components/DownloadHistoryPanel/DownloadHistoryPanel.tsx",
  "./src/components/InstrumentsPanel/InstrumentsPanel.tsx",
  "./src/components/CandlesPanel/CandlesPanel.tsx",
];

/**
 * google-protobuf copies symbols via goog.object.extend(exports, proto.ns),
 * which Rollup/Vite cannot see as named CJS exports. Repeat them as
 * exports.Name = exports.Name so lazy panels can import constructors.
 */
function protobufStaticExports(): Plugin {
  const marker = "/* protobuf-static-exports-4 */";
  return {
    name: "protobuf-static-exports",
    enforce: "pre",
    transform(code, id) {
      const file = id.split("?")[0].replace(/\\/g, "/");
      if (!file.endsWith("_pb.js") || !file.includes("/gen/js-ts/")) return;
      if (!code.includes("goog.object.extend(exports,") || code.includes(marker)) return;
      const names = new Set<string>();
      for (const match of code.matchAll(/goog\.exportSymbol\('([^']+)'/g)) {
        const last = match[1].split(".").pop();
        if (last && /^[A-Za-z_][A-Za-z0-9_]*$/.test(last)) names.add(last);
      }
      if (names.size === 0) return;
      const assigns = [...names].map((name) => `exports.${name} = exports.${name};`).join("\n");
      return {
        code: `${code}\n${marker}\n${assigns}\n`,
        map: null,
      };
    },
  };
}

const envoy = {
  target: "http://127.0.0.1:8081",
  changeOrigin: true,
  timeout: 0,
  proxyTimeout: 0,
  configure(proxy: { on: (event: string, listener: (...args: unknown[]) => void) => void }) {
    proxy.on("proxyRes", (proxyRes, _req, res) => {
      const incoming = proxyRes as { headers?: Record<string, unknown> };
      const outgoing = res as { setHeader?: (name: string, value: string) => void };
      const encoding = String(incoming.headers?.["transfer-encoding"] ?? "");
      const contentType = String(incoming.headers?.["content-type"] ?? "");
      if (encoding.includes("chunked") || contentType.includes("grpc")) {
        outgoing.setHeader?.("X-Accel-Buffering", "no");
        outgoing.setHeader?.("Cache-Control", "no-cache");
      }
    });
  },
};

const envoyProxy = {
  "/trb.nats.v1.Nats_Admin": envoy,
  "/trb.postgresql.v1.PostgreSQL_Admin": envoy,
  "/trb.postgresql.v1.PostgreSQL": envoy,
  "/trb.test.v1.Test": envoy,
  "/trb.clickhouse.v1.ClickHouse_Admin": envoy,
  "/trb.clickhouse.v1.ClickHouse": envoy,
  "/trb.indicators.v1.Indicators": envoy,
  "/v1": envoy,
  "^/tinkoff\\.public\\.invest\\.api\\.contract\\.v1\\..*": envoy,
  "/tinkoff.public.invest.api.contract.v1.": envoy,
  "/ws": {
    target: "http://127.0.0.1:9092",
    changeOrigin: true,
    ws: true,
  },
};

export default defineConfig({
  plugins: [protobufStaticExports(), react()],
  envDir: frontendDir,
  resolve: {
    alias: {
      "@marleena/trb-proto": protoJs,
    },
    dedupe: ["google-protobuf", "grpc-web"],
  },
  build: {
    target: "es2020",
    cssCodeSplit: true,
    commonjsOptions: {
      include: [/node_modules/, /[\\/]TrB_proto[\\/]/, /[\\/]gen[\\/]js-ts[\\/]/],
      transformMixedEsModules: true,
    },
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/@tanstack/react-virtual")) {
            return "virtual";
          }
          if (id.includes("node_modules/lightweight-charts") || id.includes("node_modules/fancy-canvas")) {
            return "charts";
          }
          if (
            id.includes("grpc-web") ||
            id.includes("google-protobuf") ||
            id.includes("@marleena/trb-proto") ||
            id.includes("TrB_proto")
          ) {
            return "grpc-web";
          }
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "grpc-web",
      "google-protobuf",
      "google-protobuf/google/protobuf/timestamp_pb.js",
      "google-protobuf/google/protobuf/descriptor_pb.js",
      "lightweight-charts",
      ...protoModules,
    ],
  },
  server: {
    port: 3002,
    warmup: {
      clientFiles: protoPanelFiles,
    },
    proxy: envoyProxy,
  },
  preview: {
    port: 3002,
    proxy: envoyProxy,
  },
});
