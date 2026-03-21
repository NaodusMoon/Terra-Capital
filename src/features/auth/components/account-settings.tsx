"use client";

import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Camera, CheckCircle2, Globe2, MonitorSmartphone, Moon, RefreshCw, ScanFace, ShieldCheck, Sun, Upload, UserRound, Wallet, X } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { useLanguage } from "@/components/providers/language-provider";
import { useTheme } from "@/components/providers/theme-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useWallet } from "@/components/providers/wallet-provider";
import { PLATFORM_OWNER_WALLET } from "@/lib/constants";
import { getWalletProviderLabel } from "@/lib/wallet";
import type { AppUser } from "@/types/auth";

type DocumentType = "national_id" | "passport" | "license";

interface EvidenceDigest {
  mimeType: string;
  bytes: number;
  sha256: string;
}

interface LivenessMetrics {
  score: number;
  movementRatio: number;
  detectedFrames: number;
  challenge: string;
}

type LivenessStepId = "center" | "blink" | "left" | "right";

interface LivenessStep {
  id: LivenessStepId;
  label: string;
}

type SettingsSection = "profile" | "appearance" | "verification" | "admin";

function toHex(bytes: Uint8Array) {
  return Array.from(bytes).map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function computeSha256Hex(buffer: ArrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return toHex(new Uint8Array(digest));
}

async function createDigestFromFile(file: File): Promise<EvidenceDigest> {
  const buffer = await file.arrayBuffer();
  const sha256 = await computeSha256Hex(buffer);
  return {
    mimeType: file.type || "application/octet-stream",
    bytes: file.size,
    sha256,
  };
}

async function createDigestFromBlob(blob: Blob): Promise<EvidenceDigest> {
  const buffer = await blob.arrayBuffer();
  const sha256 = await computeSha256Hex(buffer);
  return {
    mimeType: blob.type || "application/octet-stream",
    bytes: blob.size,
    sha256,
  };
}

function pickRandomChallenge() {
  const options = [
    "Gira la cabeza lentamente a la izquierda y a la derecha.",
    "Acerca y aleja tu cara de la camara manteniendote centrado.",
    "Inclina ligeramente la cabeza arriba y abajo durante la prueba.",
  ];
  return options[Math.floor(Math.random() * options.length)] ?? options[0];
}

export function AccountSettings() {
  const { user, updateAccount, submitSellerKyc, activeMode, listAccountsForAdmin, updateAccountByAdmin } = useAuth();
  const { walletAddress, walletProvider } = useWallet();
  const { language, setLanguage } = useLanguage();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const isSpanish = language === "es";
  const tr = (es: string, en: string) => (isSpanish ? es : en);
  const livenessSteps: LivenessStep[] = [
    { id: "center", label: tr("Alinea tu rostro dentro del cuadro", "Align your face inside the frame") },
    { id: "blink", label: tr("Parpadea una vez", "Blink once") },
    { id: "left", label: tr("Gira a la izquierda", "Turn left") },
    { id: "right", label: tr("Gira a la derecha", "Turn right") },
  ];
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [fullName, setFullName] = useState(user?.fullName ?? "");
  const [organization, setOrganization] = useState(user?.organization ?? "");
  const [kyc, setKyc] = useState({
    legalName: user?.sellerVerificationData?.legalName ?? "",
    documentType: (user?.sellerVerificationData?.documentType ?? "national_id") as DocumentType,
    documentLast4: user?.sellerVerificationData?.documentLast4 ?? "",
    taxId: user?.sellerVerificationData?.taxId ?? "",
    country: user?.sellerVerificationData?.country ?? "",
    supportUrl: user?.sellerVerificationData?.supportUrl ?? "",
  });
  const [documentFrontDigest, setDocumentFrontDigest] = useState<EvidenceDigest | null>(null);
  const [documentBackDigest, setDocumentBackDigest] = useState<EvidenceDigest | null>(null);
  const [livenessVideoDigest, setLivenessVideoDigest] = useState<EvidenceDigest | null>(null);
  const [livenessMetrics, setLivenessMetrics] = useState<LivenessMetrics | null>(null);
  const [livenessChallenge, setLivenessChallenge] = useState(() => pickRandomChallenge());
  const [livenessStepIndex, setLivenessStepIndex] = useState(0);
  const [livenessHint, setLivenessHint] = useState(() => tr("Presiona 'Grabar y validar movimiento' para iniciar la prueba guiada.", "Press 'Record and validate motion' to start the guided test."));
  const [cameraLoading, setCameraLoading] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [runningLiveness, setRunningLiveness] = useState(false);
  const [profileMessage, setProfileMessage] = useState("");
  const [kycMessage, setKycMessage] = useState("");
  const [adminAccounts, setAdminAccounts] = useState<AppUser[]>([]);
  const [loadingAdminAccounts, setLoadingAdminAccounts] = useState(false);
  const [adminMessage, setAdminMessage] = useState("");
  const [currentSection, setCurrentSection] = useState<SettingsSection>("profile");

  const canSubmitKyc = useMemo(
    () =>
      Boolean(
        kyc.legalName.trim() &&
          kyc.documentLast4.trim().length === 4 &&
          kyc.taxId.trim() &&
          kyc.country.trim() &&
          documentFrontDigest &&
          livenessVideoDigest &&
          livenessMetrics,
      ),
    [documentFrontDigest, kyc.country, kyc.documentLast4, kyc.legalName, kyc.taxId, livenessMetrics, livenessVideoDigest],
  );
  const isAdminUser = useMemo(
    () =>
      Boolean(
        user
        && (user.appRole === "admin" || (user.stellarPublicKey ?? "").trim().toUpperCase() === PLATFORM_OWNER_WALLET),
      ),
    [user],
  );
  const settingsSections = [
    { id: "profile" as const, label: tr("Perfil", "Profile"), shortLabel: tr("Perfil", "Profile") },
    { id: "appearance" as const, label: tr("Apariencia e idioma", "Appearance and language"), shortLabel: tr("Idioma", "Language") },
    { id: "verification" as const, label: tr("Verificacion", "Verification"), shortLabel: "KYC" },
    ...(isAdminUser ? [{ id: "admin" as const, label: "Admin", shortLabel: "Admin" }] : []),
  ];

  useEffect(() => {
    return () => {
      if (!streamRef.current) return;
      for (const track of streamRef.current.getTracks()) track.stop();
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!user || !isAdminUser) return;
    let active = true;
    setLoadingAdminAccounts(true);
    setAdminMessage("");
    void listAccountsForAdmin()
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setAdminMessage(result.message);
          setAdminAccounts([]);
          return;
        }
        setAdminAccounts(result.users);
      })
      .catch((error) => {
        if (!active) return;
        setAdminMessage(error instanceof Error ? error.message : isSpanish ? "No se pudieron cargar cuentas." : "Could not load accounts.");
        setAdminAccounts([]);
      })
      .finally(() => {
        if (!active) return;
        setLoadingAdminAccounts(false);
      });
    return () => {
      active = false;
    };
  }, [isAdminUser, isSpanish, listAccountsForAdmin, user]);

  if (!user) {
    return (
        <main className="mx-auto grid min-h-[60vh] max-w-6xl place-items-center px-5 py-12 text-sm text-[var(--color-muted)]">
        {tr("Debes iniciar sesion para editar tu cuenta.", "You must sign in to edit your account.")}
      </main>
    );
  }

  const handleProfile = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const result = await updateAccount({
      fullName,
      organization,
      stellarPublicKey: user.stellarPublicKey ?? "",
    });
    setProfileMessage(result.ok ? tr("Perfil actualizado.", "Profile updated.") : result.message);
  };

  const handleKyc = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!livenessMetrics || !documentFrontDigest || !livenessVideoDigest) {
      setKycMessage(tr("Completa documento + selfie en movimiento antes de enviar.", "Complete document + motion selfie before submitting."));
      return;
    }
    const result = await submitSellerKyc({
      ...kyc,
      documentFrontDigest,
      documentBackDigest: documentBackDigest ?? undefined,
      livenessVideoDigest,
      livenessScore: livenessMetrics.score,
      livenessDetectedFrames: livenessMetrics.detectedFrames,
      livenessMovementRatio: livenessMetrics.movementRatio,
      livenessChallenge: livenessMetrics.challenge,
    });
    setKycMessage(result.ok ? tr("Verificacion enviada/aprobada para modo vendedor.", "Verification submitted/approved for seller mode.") : result.message);
  };

  const handleDocumentPick = async (event: ChangeEvent<HTMLInputElement>, side: "front" | "back") => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const digest = await createDigestFromFile(file);
      if (side === "front") {
        setDocumentFrontDigest(digest);
      } else {
        setDocumentBackDigest(digest);
      }
      setKycMessage("");
    } catch (error) {
      setKycMessage(error instanceof Error ? error.message : tr("No se pudo leer el documento.", "Could not read the document."));
    }
  };

  const startCamera = async () => {
    setCameraLoading(true);
    setKycMessage("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraReady(true);
    } catch (error) {
      setCameraReady(false);
      setKycMessage(error instanceof Error ? error.message : tr("No se pudo abrir la camara.", "Could not open camera."));
    } finally {
      setCameraLoading(false);
    }
  };

  const stopCamera = () => {
    if (!streamRef.current) return;
    for (const track of streamRef.current.getTracks()) track.stop();
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraReady(false);
  };

  const runLivenessCheck = async () => {
    if (!videoRef.current || !streamRef.current) {
      setKycMessage(tr("Primero abre la camara.", "Open the camera first."));
      return;
    }
    setRunningLiveness(true);
    setKycMessage("");
    setLivenessStepIndex(0);
    setLivenessHint(tr("Paso 1/4: alinea tu rostro al centro.", "Step 1/4: center your face."));
    const challenge = livenessChallenge;
    try {
      const [{ FilesetResolver, FaceLandmarker }, MediaRecorderCtor] = await Promise.all([
        import("@mediapipe/tasks-vision"),
        Promise.resolve(window.MediaRecorder),
      ]);
      if (!MediaRecorderCtor) {
        setKycMessage(tr("Tu navegador no soporta grabacion de video para liveness.", "Your browser does not support video recording for liveness."));
        setRunningLiveness(false);
        return;
      }

      const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
      const detector = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
        },
        runningMode: "VIDEO",
        outputFaceBlendshapes: true,
        numFaces: 1,
        minFaceDetectionConfidence: 0.55,
        minFacePresenceConfidence: 0.55,
        minTrackingConfidence: 0.55,
      });

      const distance = (a: { x: number; y: number }, b: { x: number; y: number }) =>
        Math.hypot(a.x - b.x, a.y - b.y);
      const safePoint = (arr: Array<{ x: number; y: number }>, idx: number) => arr[idx] ?? { x: 0, y: 0 };
      const calcEyeAspectRatio = (landmarks: Array<{ x: number; y: number }>, eye: "left" | "right") => {
        const ids = eye === "left"
          ? [33, 160, 158, 133, 153, 144]
          : [362, 385, 387, 263, 373, 380];
        const p1 = safePoint(landmarks, ids[0]);
        const p2 = safePoint(landmarks, ids[1]);
        const p3 = safePoint(landmarks, ids[2]);
        const p4 = safePoint(landmarks, ids[3]);
        const p5 = safePoint(landmarks, ids[4]);
        const p6 = safePoint(landmarks, ids[5]);
        const horizontal = distance(p1, p4);
        if (horizontal <= 0.0001) return 0;
        return (distance(p2, p6) + distance(p3, p5)) / (2 * horizontal);
      };
      const getBlendshapeScore = (categories: Array<{ categoryName: string; score: number }> | undefined, name: string) =>
        categories?.find((row) => row.categoryName === name)?.score ?? 0;

      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorderCtor(streamRef.current, { mimeType: "video/webm;codecs=vp8" });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.start(250);

      const durationMs = 10000;
      const sampleEveryMs = 170;
      const centers: Array<{ x: number; y: number; size: number; noseX: number }> = [];
      let detectedFrames = 0;
      const start = performance.now();
      let lastSample = 0;
      let step: LivenessStepId = "center";
      let completedSequence = false;
      let centerStableHits = 0;
      let neutralNoseX: number | null = null;
      let eyeBaseline: number | null = null;
      let eyeWasOpen = false;

      while (performance.now() - start < durationMs) {
        const now = performance.now();
        if (now - lastSample >= sampleEveryMs) {
          const result = detector.detectForVideo(videoRef.current, now);
          const face = result.faceLandmarks?.[0];
          const blendshapes = result.faceBlendshapes?.[0]?.categories as Array<{ categoryName: string; score: number }> | undefined;
          if (face && face.length > 10) {
            const xs = face.map((p) => p.x);
            const ys = face.map((p) => p.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const width = Math.max(0.0001, maxX - minX);
            const height = Math.max(0.0001, maxY - minY);
            const centerX = minX + width / 2;
            const centerY = minY + height / 2;
            const faceSize = Math.max(width, height);
            const noseX = (safePoint(face, 1).x || centerX);
            const centerDist = Math.hypot(centerX - 0.5, centerY - 0.5);

            detectedFrames += 1;
            centers.push({
              x: centerX,
              y: centerY,
              size: faceSize,
              noseX,
            });

            if (step === "center") {
              const centered = centerDist < 0.13 && faceSize >= 0.16;
              if (centered) {
                centerStableHits += 1;
                setLivenessHint(tr("Paso 1/4: mantente al centro 1 segundo.", "Step 1/4: stay centered for 1 second."));
              } else {
                centerStableHits = Math.max(0, centerStableHits - 1);
                setLivenessHint(tr("Paso 1/4: acerca o centra tu rostro en el marco.", "Step 1/4: move closer and center your face."));
              }
              if (centerStableHits >= 5) {
                neutralNoseX = noseX;
                step = "blink";
                setLivenessStepIndex(1);
                setLivenessHint(tr("Paso 2/4: parpadea una vez.", "Step 2/4: blink once."));
              }
            } else if (step === "blink") {
              const leftEar = calcEyeAspectRatio(face, "left");
              const rightEar = calcEyeAspectRatio(face, "right");
              const avgEar = (leftEar + rightEar) / 2;
              const blendBlink = (getBlendshapeScore(blendshapes, "eyeBlinkLeft") + getBlendshapeScore(blendshapes, "eyeBlinkRight")) / 2;
              eyeBaseline = eyeBaseline === null ? avgEar : eyeBaseline * 0.85 + avgEar * 0.15;
              const openThreshold = Math.max(0.15, (eyeBaseline ?? avgEar) * 0.93);
              const closedThreshold = Math.max(0.09, (eyeBaseline ?? avgEar) * 0.72);
              if (avgEar > openThreshold || blendBlink < 0.35) {
                eyeWasOpen = true;
              }
              const blinked = eyeWasOpen && (avgEar < closedThreshold || blendBlink > 0.5);
              if (blinked) {
                step = "left";
                setLivenessStepIndex(2);
                setLivenessHint(tr("Paso 3/4: gira lentamente a la izquierda.", "Step 3/4: slowly turn left."));
              } else {
                setLivenessHint(tr("Paso 2/4: parpadea claramente una vez.", "Step 2/4: blink clearly once."));
              }
            } else if (step === "left") {
              const delta = noseX - (neutralNoseX ?? noseX);
              if (delta < -0.04) {
                step = "right";
                setLivenessStepIndex(3);
                setLivenessHint(tr("Paso 4/4: ahora gira a la derecha.", "Step 4/4: now turn right."));
              } else {
                setLivenessHint(tr("Paso 3/4: gira un poco mas a la izquierda.", "Step 3/4: turn a little more to the left."));
              }
            } else if (step === "right") {
              const delta = noseX - (neutralNoseX ?? noseX);
              if (delta > 0.04) {
                completedSequence = true;
                setLivenessHint(tr("Verificacion guiada completada.", "Guided verification completed."));
                break;
              } else {
                setLivenessHint(tr("Paso 4/4: gira un poco mas a la derecha.", "Step 4/4: turn a little more to the right."));
              }
            }
          } else {
            if (step === "center") {
              setLivenessHint(tr("No detecto rostro. Mejora luz y centra tu cara.", "No face detected. Improve lighting and center your face."));
            }
          }
          lastSample = now;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 30));
      }

      if (recorder.state !== "inactive") {
        recorder.stop();
      }
      await new Promise((resolve) => window.setTimeout(resolve, 320));
      detector.close();

      if (chunks.length === 0) {
        throw new Error(tr("No se pudo grabar la selfie en movimiento.", "Could not record motion selfie."));
      }

      const completedAllSteps = completedSequence;
      if (!completedAllSteps) {
        throw new Error(tr("No completaste la prueba guiada (centrar, parpadear, izquierda, derecha).", "You did not complete the guided test (center, blink, left, right)."));
      }

      const avgFaceSize = centers.length > 0 ? centers.reduce((sum, row) => sum + row.size, 0) / centers.length : 1;
      const minX = centers.length > 0 ? Math.min(...centers.map((row) => row.x)) : 0;
      const maxX = centers.length > 0 ? Math.max(...centers.map((row) => row.x)) : 0;
      const minY = centers.length > 0 ? Math.min(...centers.map((row) => row.y)) : 0;
      const maxY = centers.length > 0 ? Math.max(...centers.map((row) => row.y)) : 0;
      const movementRatio = avgFaceSize > 0 ? Math.max(maxX - minX, maxY - minY) / avgFaceSize : 0;
      const stability = Math.min(1, detectedFrames / 12);
      const score = Math.max(0, Math.min(1, movementRatio * 1.25 + stability * 0.35));

      const videoBlob = new Blob(chunks, { type: recorder.mimeType || "video/webm" });
      const videoDigest = await createDigestFromBlob(videoBlob);
      const metrics: LivenessMetrics = {
        score: Number(score.toFixed(4)),
        movementRatio: Number(movementRatio.toFixed(4)),
        detectedFrames,
        challenge,
      };

      setLivenessVideoDigest(videoDigest);
      setLivenessMetrics(metrics);
      setKycMessage(
        score >= 0.55 && movementRatio >= 0.09 && detectedFrames >= 8
          ? tr("Selfie en movimiento validada correctamente.", "Motion selfie validated successfully.")
          : tr("La prueba de movimiento fue debil. Repite moviendo la cabeza segun la instruccion.", "Motion test was weak. Repeat while moving your head as instructed."),
      );
      setLivenessStepIndex(4);
      setLivenessHint(tr("Prueba guiada finalizada con exito.", "Guided test completed successfully."));
      setLivenessChallenge(pickRandomChallenge());
    } catch (error) {
      setKycMessage(
        error instanceof Error
          ? error.message
          : tr("No se pudo ejecutar la prueba de movimiento facial. Verifica permisos de camara y conexion.", "Could not run facial motion test. Check camera permission and connection."),
      );
      setLivenessStepIndex(0);
      setLivenessHint(tr("Error en liveness. Reintenta con buena luz y cara centrada.", "Liveness error. Retry with good lighting and centered face."));
    } finally {
      setRunningLiveness(false);
    }
  };

  const handleAdminBuyerVerification = async (targetUserId: string, status: "unverified" | "verified") => {
    const result = await updateAccountByAdmin({ targetUserId, buyerVerificationStatus: status });
    if (!result.ok) {
      setAdminMessage(result.message);
      return;
    }
    setAdminAccounts((prev) => prev.map((row) => (row.id === targetUserId ? result.user : row)));
    setAdminMessage(tr("Cuenta actualizada.", "Account updated."));
  };

  const handleAdminRoleChange = async (targetUserId: string, role: "user" | "dev" | "admin") => {
    const result = await updateAccountByAdmin({ targetUserId, appRole: role });
    if (!result.ok) {
      setAdminMessage(result.message);
      return;
    }
    setAdminAccounts((prev) => prev.map((row) => (row.id === targetUserId ? result.user : row)));
    setAdminMessage(tr("Rol actualizado.", "Role updated."));
  };

  const handleAdminSellerVerification = async (
    targetUserId: string,
    status: "unverified" | "pending" | "verified",
  ) => {
    const result = await updateAccountByAdmin({ targetUserId, sellerVerificationStatus: status });
    if (!result.ok) {
      setAdminMessage(result.message);
      return;
    }
    setAdminAccounts((prev) => prev.map((row) => (row.id === targetUserId ? result.user : row)));
    setAdminMessage(tr("Verificacion de vendedor actualizada.", "Seller verification updated."));
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-5 sm:py-9">
      <section className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[linear-gradient(130deg,color-mix(in_oklab,var(--color-primary)_14%,var(--color-surface)),color-mix(in_oklab,var(--color-secondary)_10%,var(--color-surface)_90%))] p-6 shadow-[0_24px_50px_rgba(0,0,0,0.11)] sm:p-7">
        <div className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-[color:color-mix(in_oklab,var(--color-secondary)_24%,transparent)] blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-10 h-48 w-48 rounded-full bg-[color:color-mix(in_oklab,var(--color-primary)_22%,transparent)] blur-3xl" />
        <div className="relative flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="terra-badge">{tr("Cuenta y seguridad", "Account and security")}</p>
            <h1 className="tc-heading mt-3 text-3xl font-black sm:text-4xl">{tr("Configuracion de la cuenta", "Account settings")}</h1>
            <p className="tc-subtitle mt-2 max-w-2xl text-sm">
              {tr("Gestiona perfil, wallet, apariencia y verificacion KYC en una sola experiencia fluida.", "Manage profile, wallet, appearance and KYC verification in one seamless experience.")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={activeMode === "seller" ? "/seller" : "/dashboard"} className="inline-flex items-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm font-semibold hover:bg-[var(--color-surface-soft)]">
              <ArrowLeft size={15} /> {tr("Volver al panel", "Back to panel")}
            </Link>
            <Link href={activeMode === "seller" ? "/seller" : "/dashboard"} className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-soft)]" aria-label={tr("Cerrar", "Close")}>
              <X size={15} />
            </Link>
          </div>
        </div>
      </section>

      <section className="mt-6 grid gap-4 lg:grid-cols-3">
        <Card className="relative overflow-hidden">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/15 blur-2xl" />
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]"><UserRound size={14} /> {tr("Usuario", "User")}</p>
          <p className="mt-2 text-xl font-black">{user.fullName}</p>
          <p className="mt-1 text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">{activeMode === "seller" ? tr("Modo vendedor", "Seller mode") : tr("Modo inversor", "Investor mode")}</p>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-secondary/20 blur-2xl" />
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]"><Wallet size={14} /> {tr("Wallet conectada", "Connected wallet")}</p>
          <p className="mt-2 text-base font-bold">{walletProvider ? getWalletProviderLabel(walletProvider) : tr("No conectado", "Not connected")}</p>
          <p className="mt-1 truncate text-xs text-[var(--color-muted)]">{walletAddress ?? tr("Sin direccion conectada", "No connected address")}</p>
        </Card>
        <Card className="relative overflow-hidden">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-emerald-500/15 blur-2xl" />
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]"><BadgeCheck size={14} /> {tr("Verificacion vendedor", "Seller verification")}</p>
          <p className="mt-2 text-xl font-black">{user.sellerVerificationStatus}</p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">{tr("Documento + prueba de vida facial", "Document + facial liveness proof")}</p>
        </Card>
      </section>

      <section className="mt-6">
        <div className="tc-mobile-scroll flex gap-2 overflow-x-auto rounded-[1.65rem] border border-[var(--color-border)] bg-[linear-gradient(180deg,color-mix(in_oklab,var(--color-surface)_96%,white_4%),color-mix(in_oklab,var(--color-surface-soft)_84%,transparent))] p-2">
          {settingsSections.map((section) => (
            <button
              key={section.id}
              type="button"
              onClick={() => setCurrentSection(section.id)}
              className={`min-w-fit rounded-2xl px-4 py-3 text-sm font-semibold transition ${currentSection === section.id ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)] shadow-[0_14px_26px_rgba(25,44,16,0.22)]" : "bg-[var(--color-surface)] text-[var(--color-foreground)]"}`}
            >
              <span className="hidden sm:inline">{section.label}</span>
              <span className="sm:hidden">{section.shortLabel}</span>
            </button>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-2">
        <Card className={`rounded-3xl ${currentSection !== "profile" ? "hidden lg:block" : ""}`}>
          <h2 className="tc-heading flex items-center gap-2 text-xl font-black"><UserRound size={18} /> {tr("Perfil", "Profile")}</h2>
          <form className="mt-4 grid gap-3" onSubmit={handleProfile}>
            <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder={tr("Nombre completo", "Full name")} value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder={tr("Organizacion", "Organization")} value={organization} onChange={(e) => setOrganization(e.target.value)} />
            <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] px-3 text-[var(--color-muted)]" value={user.stellarPublicKey ?? ""} disabled readOnly />
            {profileMessage && <p className="text-sm text-[var(--color-primary)]">{profileMessage}</p>}
            <Button type="submit" className="w-full sm:w-fit">{tr("Guardar perfil", "Save profile")}</Button>
          </form>
        </Card>

        <Card className={`rounded-3xl ${currentSection !== "appearance" ? "hidden lg:block" : ""}`}>
          <h2 className="tc-heading flex items-center gap-2 text-xl font-black"><MonitorSmartphone size={18} /> {tr("Apariencia", "Appearance")}</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{tr("Personaliza el tema visual de tu panel.", "Personalize your panel visual theme.")}</p>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <Button type="button" variant="outline" className={`h-11 gap-2 px-2 text-xs ${theme === "light" ? "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-contrast)]" : ""}`} onClick={() => setTheme("light")}>
              <Sun size={15} />
              {tr("Claro", "Light")}
            </Button>
            <Button type="button" variant="outline" className={`h-11 gap-2 px-2 text-xs ${theme === "dark" ? "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-contrast)]" : ""}`} onClick={() => setTheme("dark")}>
              <Moon size={15} />
              {tr("Oscuro", "Dark")}
            </Button>
            <Button type="button" variant="outline" className={`h-11 gap-2 px-2 text-xs ${theme === "system" ? "border-transparent bg-[var(--color-primary)] text-[var(--color-primary-contrast)]" : ""}`} onClick={() => setTheme("system")}>
              <MonitorSmartphone size={15} />
              {tr("Sistema", "System")}
            </Button>
          </div>
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            {tr("Activo", "Active")}: {theme === "system" ? `${tr("Sistema", "System")} (${resolvedTheme === "dark" ? tr("oscuro", "dark") : tr("claro", "light")})` : theme === "dark" ? tr("Oscuro", "Dark") : tr("Claro", "Light")}
          </p>
          <div className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
            <div className="flex items-center gap-2">
              <Globe2 size={18} className="text-[var(--color-primary)]" />
              <div>
                <p className="text-sm font-semibold">{tr("Idioma de la app", "App language")}</p>
                <p className="text-xs text-[var(--color-muted)]">{tr("Selecciona el idioma principal de toda la interfaz.", "Select the primary language for the whole interface.")}</p>
              </div>
            </div>
            <select
              className="mt-3 h-11 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
              value={language}
              onChange={(event) => setLanguage(event.target.value as typeof language)}
            >
              <option value="es">Espanol</option>
              <option value="en">English</option>
              <option value="pt">Portugues</option>
              <option value="fr">Francais</option>
            </select>
          </div>
        </Card>
      </section>

      <section className={`mt-6 ${currentSection !== "verification" ? "hidden lg:block" : ""}`}>
        <Card className="rounded-3xl">
          <h2 className="tc-heading flex items-center gap-2 text-xl font-black"><ScanFace size={18} /> {tr("Verificacion para modo vendedor", "Verification for seller mode")}</h2>
          <p className="tc-subtitle mt-1 text-sm">{tr("Estado actual", "Current status")}: <strong>{user.sellerVerificationStatus}</strong></p>
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            {tr("Requisitos: documento de identidad + selfie en movimiento validada con deteccion facial.", "Requirements: identity document + motion selfie validated with facial detection.")}
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            {tr("Privacidad: las imagenes/video se procesan localmente; al servidor solo se envian hashes y metricas, no archivos crudos.", "Privacy: images/video are processed locally; only hashes and metrics are sent to server, not raw files.")}
          </p>
          <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={handleKyc}>
            <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder={tr("Nombre legal", "Legal name")} value={kyc.legalName} onChange={(e) => setKyc((prev) => ({ ...prev, legalName: e.target.value }))} required />
            <select className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" value={kyc.documentType} onChange={(e) => setKyc((prev) => ({ ...prev, documentType: e.target.value as DocumentType }))}>
              <option value="national_id">{tr("Documento nacional", "National ID")}</option>
              <option value="passport">{tr("Pasaporte", "Passport")}</option>
              <option value="license">{tr("Licencia conducir", "Driver license")}</option>
            </select>
            <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder={tr("Documento ultimos 4", "Document last 4")} maxLength={4} value={kyc.documentLast4} onChange={(e) => setKyc((prev) => ({ ...prev, documentLast4: e.target.value }))} required />
            <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder="Tax ID / CUIT" value={kyc.taxId} onChange={(e) => setKyc((prev) => ({ ...prev, taxId: e.target.value }))} required />
            <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3" placeholder={tr("Pais", "Country")} value={kyc.country} onChange={(e) => setKyc((prev) => ({ ...prev, country: e.target.value }))} required />
            <input className="h-11 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 md:col-span-2" placeholder={tr("URL soporte documental (opcional)", "Document support URL (optional)")} value={kyc.supportUrl} onChange={(e) => setKyc((prev) => ({ ...prev, supportUrl: e.target.value }))} />

            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 md:col-span-2">
              <p className="text-sm font-semibold">{tr("Documento de identidad", "Identity document")}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] px-3 py-3 text-sm hover:bg-[var(--color-surface-soft)]">
                  <Upload size={15} /> {tr("Subir frente", "Upload front")}
                  <input type="file" accept="image/*" className="hidden" onChange={(event) => { void handleDocumentPick(event, "front"); }} />
                </label>
                <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-background)] px-3 py-3 text-sm hover:bg-[var(--color-surface-soft)]">
                  <Upload size={15} /> {tr("Subir reverso (opcional)", "Upload back (optional)")}
                  <input type="file" accept="image/*" className="hidden" onChange={(event) => { void handleDocumentPick(event, "back"); }} />
                </label>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]">
                  <p className="border-b border-[var(--color-border)] px-3 py-2 text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">{tr("Frente", "Front")}</p>
                  <div className="grid h-24 place-items-center px-3 text-xs text-[var(--color-muted)]">
                    {!documentFrontDigest && <span>{tr("Sin archivo", "No file")}</span>}
                    {documentFrontDigest && <span>{tr("Archivo listo", "File ready")} ({Math.ceil(documentFrontDigest.bytes / 1024)} KB)</span>}
                  </div>
                </div>
                <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-background)]">
                  <p className="border-b border-[var(--color-border)] px-3 py-2 text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">{tr("Reverso", "Back")}</p>
                  <div className="grid h-24 place-items-center px-3 text-xs text-[var(--color-muted)]">
                    {!documentBackDigest && <span>{tr("Opcional", "Optional")}</span>}
                    {documentBackDigest && <span>{tr("Archivo listo", "File ready")} ({Math.ceil(documentBackDigest.bytes / 1024)} KB)</span>}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface-soft)] p-4 md:col-span-2">
              <p className="text-sm font-semibold">{tr("Selfie en movimiento (liveness)", "Motion selfie (liveness)")}</p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">{tr("Instruccion dinamica", "Dynamic instruction")}: {livenessHint}</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {livenessSteps.map((step, idx) => {
                  const done = livenessStepIndex > idx || (livenessStepIndex >= 4 && idx === livenessSteps.length - 1);
                  const active = livenessStepIndex === idx && runningLiveness;
                  return (
                    <div
                      key={step.id}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${done ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" : active ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--color-foreground)]" : "border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-muted)]"}`}
                    >
                      {done ? <CheckCircle2 size={14} /> : <span className="grid h-4 w-4 place-items-center rounded-full border border-current text-[10px]">{idx + 1}</span>}
                      <span>{step.label}</span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 grid gap-3 lg:grid-cols-[1.1fr_0.9fr]">
                <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-black/80">
                  <video ref={videoRef} muted playsInline className="h-56 w-full object-cover" />
                </div>
                <div className="space-y-2">
                  <Button type="button" variant="outline" className="w-full gap-2" disabled={cameraLoading || cameraReady} onClick={() => { void startCamera(); }}>
                    <Camera size={15} /> {cameraLoading ? tr("Abriendo camara...", "Opening camera...") : tr("Abrir camara", "Open camera")}
                  </Button>
                  <Button type="button" variant="outline" className="w-full gap-2" disabled={!cameraReady || runningLiveness} onClick={() => { void runLivenessCheck(); }}>
                    <RefreshCw size={15} /> {runningLiveness ? tr("Validando movimiento...", "Validating movement...") : tr("Grabar y validar movimiento", "Record and validate movement")}
                  </Button>
                  <Button type="button" variant="outline" className="w-full" disabled={!cameraReady} onClick={stopCamera}>
                    {tr("Cerrar camara", "Close camera")}
                  </Button>
                  {livenessMetrics && (
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-xs text-[var(--color-muted)]">
                      <p>Score: <strong>{(livenessMetrics.score * 100).toFixed(1)}%</strong></p>
                      <p>{tr("Movimiento", "Movement")}: <strong>{(livenessMetrics.movementRatio * 100).toFixed(1)}%</strong></p>
                      <p>{tr("Frames detectados", "Detected frames")}: <strong>{livenessMetrics.detectedFrames}</strong></p>
                      <p>Video: <strong>{livenessVideoDigest ? `${Math.ceil(livenessVideoDigest.bytes / 1024)} KB` : tr("No generado", "Not generated")}</strong></p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {kycMessage && <p className="text-sm text-[var(--color-primary)] md:col-span-2">{kycMessage}</p>}
            <Button type="submit" className="md:col-span-2" disabled={!canSubmitKyc || runningLiveness}>{tr("Enviar verificacion", "Submit verification")}</Button>
          </form>
        </Card>
      </section>

      {isAdminUser && (
        <section className={`mt-6 ${currentSection !== "admin" ? "hidden lg:block" : ""}`}>
          <Card className="rounded-3xl">
            <h2 className="tc-heading flex items-center gap-2 text-xl font-black"><ShieldCheck size={18} /> {tr("Administracion de cuentas", "Account administration")}</h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              {tr("Vista exclusiva de admin para verificar compradores y cambiar tipo de usuario.", "Admin-only view to verify buyers and change user type.")}
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)] text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">
                    <th className="py-2 pr-4">{tr("Cuenta", "Account")}</th>
                    <th className="py-2 pr-4">Wallet</th>
                    <th className="py-2 pr-4">{tr("Rol", "Role")}</th>
                    <th className="py-2 pr-4">{tr("Comprador", "Buyer")}</th>
                    <th className="py-2">{tr("Vendedor", "Seller")}</th>
                  </tr>
                </thead>
                <tbody>
                  {adminAccounts.map((account) => (
                    <tr key={account.id} className="border-b border-[var(--color-border)] align-top">
                      <td className="py-3 pr-4">
                        <p className="font-semibold">{account.fullName}</p>
                        <p className="text-xs text-[var(--color-muted)]">{account.organization || "-"}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <p className="max-w-[260px] break-all text-xs text-[var(--color-muted)]">{account.stellarPublicKey ?? "-"}</p>
                      </td>
                      <td className="py-3 pr-4">
                        {(() => {
                          const isOwnerAccount = (account.stellarPublicKey ?? "").trim().toUpperCase() === PLATFORM_OWNER_WALLET;
                          return (
                        <select
                          className="h-9 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2 text-xs"
                          value={account.appRole}
                          disabled={isOwnerAccount}
                          onChange={(event) => { void handleAdminRoleChange(account.id, event.target.value as "user" | "dev" | "admin"); }}
                        >
                          <option value="user">user</option>
                          <option value="dev">dev</option>
                          <option value="admin">admin</option>
                        </select>
                          );
                        })()}
                      </td>
                      <td className="py-3 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-xs">{account.buyerVerificationStatus}</span>
                          {(() => {
                            const isOwnerAccount = (account.stellarPublicKey ?? "").trim().toUpperCase() === PLATFORM_OWNER_WALLET;
                            return (
                          <Button
                            type="button"
                            variant="outline"
                            className="h-8 px-2 text-xs"
                            disabled={isOwnerAccount}
                            onClick={() => {
                              void handleAdminBuyerVerification(
                                account.id,
                                account.buyerVerificationStatus === "verified" ? "unverified" : "verified",
                              );
                            }}
                          >
                            {account.buyerVerificationStatus === "verified" ? tr("Quitar verificacion", "Remove verification") : tr("Verificar", "Verify")}
                          </Button>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-xs">{account.sellerVerificationStatus}</span>
                          {(() => {
                            const isOwnerAccount = (account.stellarPublicKey ?? "").trim().toUpperCase() === PLATFORM_OWNER_WALLET;
                            return (
                              <Button
                                type="button"
                                variant="outline"
                                className="h-8 px-2 text-xs"
                                disabled={isOwnerAccount}
                                onClick={() => {
                                  void handleAdminSellerVerification(
                                    account.id,
                                    account.sellerVerificationStatus === "verified" ? "unverified" : "verified",
                                  );
                                }}
                              >
                                {account.sellerVerificationStatus === "verified" ? tr("Quitar verificacion", "Remove verification") : tr("Verificar", "Verify")}
                              </Button>
                            );
                          })()}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!loadingAdminAccounts && adminAccounts.length === 0 && (
                    <tr>
                      <td colSpan={5} className="py-4 text-sm text-[var(--color-muted)]">
                        {tr("No hay cuentas registradas para mostrar.", "There are no registered accounts to show.")}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {loadingAdminAccounts && <p className="mt-3 text-sm text-[var(--color-muted)]">{tr("Cargando cuentas...", "Loading accounts...")}</p>}
            {adminMessage && <p className="mt-3 text-sm text-[var(--color-primary)]">{adminMessage}</p>}
          </Card>
        </section>
      )}
    </main>
  );
}

