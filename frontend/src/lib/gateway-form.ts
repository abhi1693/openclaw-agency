import { gatewaysStatusApiV1GatewaysStatusGet } from "@/api/generated/gateways/gateways";

export const DEFAULT_WORKSPACE_ROOT = "~/.openclaw";

export type GatewayCheckStatus = "idle" | "checking" | "success" | "error";

function hasValidHost(url: URL): boolean {
  // Reject empty host forms like ws://:443 while allowing localhost, domains and IPs.
  return Boolean(url.hostname && url.hostname.trim().length > 0);
}

export const validateGatewayUrl = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return "Gateway URL is required.";
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "ws:" && url.protocol !== "wss:") {
      return "Gateway URL must start with ws:// or wss://.";
    }
    if (!hasValidHost(url)) {
      return "Gateway URL must include a valid host.";
    }

    // Default ports are valid (ws:80, wss:443). Explicit ports are optional.
    if (url.port) {
      const port = Number.parseInt(url.port, 10);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        return "Gateway URL has an invalid port.";
      }
    }

    return null;
  } catch {
    return "Enter a valid gateway URL.";
  }
};

export async function checkGatewayConnection(params: {
  gatewayUrl: string;
  gatewayToken: string;
  gatewayDisableDevicePairing: boolean;
  gatewayAllowInsecureTls: boolean;
}): Promise<{ ok: boolean; message: string }> {
  try {
    const requestParams: {
      gateway_url: string;
      gateway_token?: string;
      gateway_disable_device_pairing: boolean;
      gateway_allow_insecure_tls: boolean;
    } = {
      gateway_url: params.gatewayUrl.trim(),
      gateway_disable_device_pairing: params.gatewayDisableDevicePairing,
      gateway_allow_insecure_tls: params.gatewayAllowInsecureTls,
    };
    if (params.gatewayToken.trim()) {
      requestParams.gateway_token = params.gatewayToken.trim();
    }

    const response = await gatewaysStatusApiV1GatewaysStatusGet(requestParams);
    if (response.status !== 200) {
      return { ok: false, message: "Unable to reach gateway." };
    }
    const data = response.data;
    if (!data.connected) {
      return { ok: false, message: data.error ?? "Unable to reach gateway." };
    }
    return { ok: true, message: "Gateway reachable." };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error ? error.message : "Unable to reach gateway.",
    };
  }
}
