import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
export type Provider = "google" | "github";
export type Intent = "signin" | "reauth" | "link";
export interface NativeAttempt {
  verifier: string;
  challenge: string;
  nonce: string;
  provider: Provider;
  intent: Intent;
}
async function randomHex(length: number): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(length);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
export async function createAttempt(
  provider: Provider,
  intent: Intent,
): Promise<NativeAttempt> {
  const verifier = await randomHex(32);
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    verifier,
    { encoding: Crypto.CryptoEncoding.BASE64 },
  );
  return {
    verifier,
    challenge: hash.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""),
    nonce: await randomHex(32),
    provider,
    intent,
  };
}
export function signInUrl(origin: string, attempt: NativeAttempt): string {
  return `${origin}/v1/auth/${attempt.provider}/start?${new URLSearchParams({ platform: "android", challenge: attempt.challenge, redirectUri: "zmos://auth", intent: "signin" })}`;
}
export async function completeAttempt(
  origin: string,
  startUrl: string,
  attempt: NativeAttempt,
): Promise<string | null> {
  const result = await WebBrowser.openAuthSessionAsync(startUrl, "zmos://auth");
  if (result.type !== "success") return null;
  const redirect = new URL(result.url);
  if (
    redirect.protocol !== "zmos:" ||
    redirect.hostname !== "auth" ||
    (redirect.pathname !== "" && redirect.pathname !== "/")
  )
    throw new Error("인증 복귀 주소가 일치하지 않습니다.");
  const code = redirect.searchParams.get("code");
  if (!code) throw new Error("인증 복귀 코드를 받지 못했습니다.");
  const response = await fetch(`${origin}/v1/auth/native/exchange`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, verifier: attempt.verifier }),
    signal: AbortSignal.timeout(15000),
  });
  const data: unknown = await response.json();
  if (
    !response.ok ||
    !data ||
    typeof data !== "object" ||
    !("bootstrapTicket" in data) ||
    typeof data.bootstrapTicket !== "string"
  )
    throw new Error("인증 결과를 확인하지 못했습니다. 다시 로그인해 주세요.");
  return data.bootstrapTicket;
}
export function preparationScript(
  origin: string,
  attempt: NativeAttempt,
): string {
  // Only a native toolbar action injects this fixed script into the trusted top document.
  return `void (async()=>{const expected=${JSON.stringify(origin)},nonce=${JSON.stringify(attempt.nonce)};if(window!==window.top||location.origin!==expected)return;try{const meResponse=await fetch('/v1/me',{credentials:'same-origin',signal:AbortSignal.timeout(12000)});if(!meResponse.ok)throw new Error('account');const me=await meResponse.json();const response=await fetch('/v1/auth/native/prepare',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','X-CSRF-Token':me.csrf},body:JSON.stringify(${JSON.stringify({ provider: attempt.provider, intent: attempt.intent, challenge: attempt.challenge })}),signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error('prepare');const data=await response.json();const url=new URL(data.startUrl);if(url.origin!==expected||url.pathname!=='/v1/auth/native/start'||!url.searchParams.get('ticket'))throw new Error('redirect');url.hash='native='+nonce;location.assign(url.toString());}catch{location.assign(expected+'/native-auth-failed#native='+nonce);}})();true;`;
}
