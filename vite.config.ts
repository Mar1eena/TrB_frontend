import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const protoJs = path.resolve(frontendDir, "node_modules/@marleena/trb-proto/gen/js-ts");

const protoModules = [
  "@marleena/trb-proto/tinvest/common_pb",
  "@marleena/trb-proto/tinvest/users_pb",
  "@marleena/trb-proto/tinvest/UsersServiceClientPb",
  "@marleena/trb-proto/tinvest/instruments_pb",
  "@marleena/trb-proto/tinvest/InstrumentsServiceClientPb",
  "@marleena/trb-proto/tinvest/marketdata_pb",
  "@marleena/trb-proto/tinvest/MarketdataServiceClientPb",
  "@marleena/trb-proto/tinvest/operations_pb",
  "@marleena/trb-proto/tinvest/OperationsServiceClientPb",
  "@marleena/trb-proto/tinvest/orders_pb",
  "@marleena/trb-proto/tinvest/OrdersServiceClientPb",
  "@marleena/trb-proto/tinvest/sandbox_pb",
  "@marleena/trb-proto/tinvest/SandboxServiceClientPb",
  "@marleena/trb-proto/tinvest/signals_pb",
  "@marleena/trb-proto/tinvest/SignalsServiceClientPb",
  "@marleena/trb-proto/tinvest/stoporders_pb",
  "@marleena/trb-proto/tinvest/StopordersServiceClientPb",
  "@marleena/trb-proto/api/nats/manager_pb",
  "@marleena/trb-proto/api/nats/ManagerServiceClientPb",
  "@marleena/trb-proto/api/db_api/db_api_pb",
  "@marleena/trb-proto/api/db_api/Db_apiServiceClientPb",
  "@marleena/trb-proto/api/test/test_pb",
  "@marleena/trb-proto/api/test/TestServiceClientPb",
  "@marleena/trb-proto/api/clickhouse/manager_pb",
  "@marleena/trb-proto/api/clickhouse/ManagerServiceClientPb",
  "@marleena/trb-proto/google/api/annotations_pb",
  "@marleena/trb-proto/google/api/http_pb",
  "@marleena/trb-proto/google/api/field_behavior_pb",
];

const protoPanelFiles = [
  "./src/main.tsx",
  "./src/App.tsx",
  "./src/components/ServiceTree.tsx",
  "./src/components/NatsAdminPanel.tsx",
  "./src/components/UsersPanel.tsx",
  "./src/components/GrpcDebugPanel.tsx",
  "./src/components/DataApiDebugPanel.tsx",
  "./src/components/ClickHouseManagerPanel.tsx",
  "./src/components/SchedulerPanel.tsx",
  "./src/components/DownloadHistoryPanel.tsx",
  "./src/components/HistoricCandlePanel.tsx",
];

/**
 * google-protobuf copies symbols via goog.object.extend(exports, proto.ns),
 * which Rollup/Vite cannot see as named CJS exports. Repeat them as
 * exports.Name = exports.Name so lazy panels can import constructors.
 */
function protobufStaticExports(): Plugin {
  const marker = "/* protobuf-static-exports */";
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

const envoyProxy = {
  "/trb.nats.manager.public.contract.v1.NatsJetStreamManager": {
    target: "http://127.0.0.1:8081",
    changeOrigin: true,
  },
  "/trb.db.api.public.contract.v1.DbApi": {
    target: "http://127.0.0.1:8081",
    changeOrigin: true,
  },
  "/trb.test.public.contract.v1.Test": {
    target: "http://127.0.0.1:8081",
    changeOrigin: true,
  },
  "/v1/test": {
    target: "http://127.0.0.1:8081",
    changeOrigin: true,
  },
  "/trb.clickhouse.manager.public.contract.v1.ClickHouseManager": {
    target: "http://127.0.0.1:8081",
    changeOrigin: true,
  },
  "^/tinkoff\\.public\\.invest\\.api\\.contract\\.v1\\..*": {
    target: "http://127.0.0.1:8081",
    changeOrigin: true,
  },
  "/tinkoff.public.invest.api.contract.v1.": {
    target: "http://127.0.0.1:8081",
    changeOrigin: true,
  },
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
