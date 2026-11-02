import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";
import type {
  ShouldStartLoadRequest,
  WebViewSource,
} from "react-native-webview/lib/WebViewTypes";
import {
  completeAttempt,
  createAttempt,
  preparationScript,
  signInUrl,
  type Intent,
  type NativeAttempt,
  type Provider,
} from "./auth";
import { navigationDecision } from "./navigation";

const rawOrigin =
  process.env.EXPO_PUBLIC_HOST_ORIGIN ?? "http://localhost:4300";
const host = new URL(rawOrigin);
if (
  host.origin !== rawOrigin ||
  host.username ||
  host.password ||
  (host.protocol !== "https:" &&
    !(
      __DEV__ &&
      host.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(host.hostname)
    ))
)
  throw new Error(
    "호스트 주소는 HTTPS origin이어야 합니다. 개발 중에는 loopback HTTP만 허용합니다.",
  );
const origin = host.origin;
const assetOrigin =
  process.env.EXPO_PUBLIC_ASSET_ORIGIN ?? "http://localhost:4311";

export default function App(): React.JSX.Element {
  const web = useRef<WebView>(null);
  const [source, setSource] = useState<WebViewSource>({ uri: origin });
  const [loading, setLoading] = useState(true);
  const [authenticating, setAuthenticating] = useState(false);
  const [authMenu, setAuthMenu] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<NativeAttempt | null>(null);
  const phase = useRef<"idle" | "preparing" | "browser">("idle");
  const prepareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [currentUrl, setCurrentUrl] = useState(origin);
  const clearAttempt = useCallback((): void => {
    pending.current = null;
    phase.current = "idle";
    if (prepareTimer.current) clearTimeout(prepareTimer.current);
    prepareTimer.current = null;
    setAuthenticating(false);
  }, []);
  useEffect(
    () => (): void => {
      if (prepareTimer.current) clearTimeout(prepareTimer.current);
      pending.current = null;
      phase.current = "idle";
    },
    [],
  );
  const finish = useCallback(
    async (startUrl: string, attempt: NativeAttempt): Promise<void> => {
      if (phase.current !== "preparing" || pending.current !== attempt) return;
      phase.current = "browser";
      if (prepareTimer.current) clearTimeout(prepareTimer.current);
      prepareTimer.current = null;
      try {
        const ticket = await completeAttempt(origin, startUrl, attempt);
        if (pending.current !== attempt) return;
        if (ticket)
          setSource({
            uri: `${origin}/v1/auth/native/bootstrap`,
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: `ticket=${encodeURIComponent(ticket)}`,
          });
      } catch (e) {
        if (pending.current === attempt)
          setError(
            e instanceof Error
              ? e.message
              : "인증을 완료하지 못했습니다. 다시 시도해 주세요.",
          );
      } finally {
        if (pending.current === attempt) clearAttempt();
      }
    },
    [clearAttempt],
  );
  const begin = async (provider: Provider, intent: Intent): Promise<void> => {
    if (phase.current !== "idle") return;
    phase.current = "preparing";
    setAuthenticating(true);
    setAuthMenu(false);
    setError("");
    try {
      const attempt = await createAttempt(provider, intent);
      pending.current = attempt;
      if (intent === "signin") {
        await finish(signInUrl(origin, attempt), attempt);
        return;
      }
      if (new URL(currentUrl).origin !== origin || !web.current)
        throw new Error("먼저 앱의 Store 화면으로 돌아와 주세요.");
      web.current.injectJavaScript(preparationScript(origin, attempt));
      prepareTimer.current = setTimeout(() => {
        if (pending.current === attempt) {
          clearAttempt();
          setError(
            "현재 계정의 인증 준비에 실패했습니다. 로그인 상태를 확인하고 다시 시도해 주세요.",
          );
        }
      }, 20000);
    } catch (e) {
      clearAttempt();
      setError(e instanceof Error ? e.message : "인증 준비에 실패했습니다.");
    }
  };
  const allowNavigation = (request: ShouldStartLoadRequest): boolean => {
    const attempt = pending.current;
    const decision = navigationDecision(request.url, request.isTopFrame, {
      origin,
      assetOrigin,
      preparing: phase.current === "preparing",
      nonce: attempt?.nonce,
    });
    if (decision === "allow") return true;
    if (decision === "auth-start" && attempt) {
      const url = new URL(request.url);
      url.hash = "";
      void finish(url.toString(), attempt);
      return false;
    }
    if (decision === "auth-failed") {
      clearAttempt();
      setError(
        "현재 계정의 인증을 준비하지 못했습니다. 로그인 상태를 확인해 주세요.",
      );
    } else if (decision === "missing-frame")
      setError(
        "기기의 화면 이동을 안전하게 확인하지 못했습니다. 앱 빌드를 확인해 주세요.",
      );
    else if (decision === "auth-menu")
      setError("상단의 계정 인증에서 로그인·연결·본인 확인을 선택해 주세요.");
    else setError("허용되지 않은 외부 화면 이동을 차단했습니다.");
    return false;
  };
  const onNavigate = (event: WebViewNavigation): void => {
    setCurrentUrl(event.url);
  };
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <View style={styles.toolbar}>
          <Text style={styles.brand}>zm·os</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Store로 돌아가기"
            style={styles.button}
            onPress={() => {
              if (new URL(currentUrl).origin === origin)
                web.current?.injectJavaScript(
                  "if(window===window.top)window.dispatchEvent(new Event('zm-host-back'));true;",
                );
            }}
          >
            <Text style={styles.buttonText}>Store로</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.button}
            disabled={authenticating}
            onPress={() => setAuthMenu(true)}
          >
            <Text style={styles.buttonText}>계정 인증</Text>
          </Pressable>
        </View>
        {error !== "" && (
          <View style={styles.error}>
            <Text accessibilityRole="alert" style={styles.errorText}>
              {error}
            </Text>
            <Pressable accessibilityRole="button" onPress={() => setError("")}>
              <Text style={styles.errorText}>닫기</Text>
            </Pressable>
          </View>
        )}
        {(loading || authenticating) && (
          <View style={styles.progress}>
            <ActivityIndicator color="#204bb5" />
            <Text>
              {authenticating ? "계정 인증 중…" : "앱을 불러오는 중…"}
            </Text>
          </View>
        )}
        <WebView
          ref={web}
          source={source}
          style={styles.web}
          originWhitelist={[origin, "about:blank", assetOrigin]}
          onShouldStartLoadWithRequest={allowNavigation}
          onNavigationStateChange={onNavigate}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setError(
              "웹 호스트에 연결하지 못했습니다. 시험 서버와 기기 연결을 확인해 주세요.",
            );
            setLoading(false);
          }}
          onHttpError={(event) => {
            if (event.nativeEvent.statusCode >= 400)
              setError(
                `화면 요청이 실패했습니다 (${event.nativeEvent.statusCode}).`,
              );
          }}
          javaScriptEnabled
          domStorageEnabled
          thirdPartyCookiesEnabled={false}
          sharedCookiesEnabled={false}
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          javaScriptCanOpenWindowsAutomatically={false}
          setSupportMultipleWindows
          mediaPlaybackRequiresUserAction
          geolocationEnabled={false}
          mixedContentMode={__DEV__ ? "compatibility" : "never"}
          onOpenWindow={() => setError("새 창 열기를 차단했습니다.")}
        />
        <Modal
          visible={authMenu}
          transparent
          animationType="fade"
          onRequestClose={() => setAuthMenu(false)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modal}>
              <Text style={styles.modalTitle}>계정 인증</Text>
              <Text style={styles.description}>
                연결과 본인 확인은 현재 로그인한 계정에 적용됩니다.
              </Text>
              {(
                [
                  ["signin", "로그인"],
                  ["link", "로그인 수단 연결"],
                  ["reauth", "본인 확인"],
                ] as const
              ).map(([intent, title]) => (
                <View key={intent} style={styles.authGroup}>
                  <Text style={styles.groupTitle}>{title}</Text>
                  <View style={styles.authButtons}>
                    {(["google", "github"] as const).map((provider) => (
                      <Pressable
                        key={provider}
                        accessibilityRole="button"
                        accessibilityLabel={`${provider === "google" ? "Google" : "GitHub"} ${title}`}
                        style={styles.button}
                        onPress={() => {
                          void begin(provider, intent);
                        }}
                      >
                        <Text style={styles.buttonText}>
                          {provider === "google" ? "Google" : "GitHub"}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))}
              <Pressable
                accessibilityRole="button"
                style={styles.button}
                onPress={() => setAuthMenu(false)}
              >
                <Text style={styles.buttonText}>닫기</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#fff" },
  web: { flex: 1 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#dbe3ef",
  },
  brand: { fontSize: 22, fontWeight: "800", color: "#1d2e46", flex: 1 },
  button: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 7,
    backgroundColor: "#edf3ff",
  },
  buttonText: { color: "#204bb5", fontWeight: "600" },
  progress: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
    padding: 10,
    backgroundColor: "#f4f7ff",
  },
  error: {
    flexDirection: "row",
    gap: 10,
    padding: 12,
    backgroundColor: "#fff0f1",
  },
  errorText: { color: "#a32632", flexShrink: 1 },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#162d5166",
  },
  modal: { borderRadius: 16, padding: 22, backgroundColor: "#fff" },
  modalTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1d2e46",
    marginBottom: 8,
  },
  description: { color: "#5e6f87", lineHeight: 21, marginBottom: 12 },
  authGroup: { marginVertical: 10 },
  groupTitle: { color: "#1d2e46", fontWeight: "600", marginBottom: 8 },
  authButtons: { flexDirection: "row", gap: 10 },
});
