"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, Coins, Landmark, ShieldCheck, Sprout, Wallet } from "lucide-react";
import { WheatFieldBackdrop } from "@/features/landing/components/wheat-field-backdrop";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FadeIn } from "@/components/ui/fade-in";

const problemPoints = [
  "Desplazamiento generacional y tierras productivas subutilizadas.",
  "Mercado inmobiliario rural lento y sin liquidez para propietarios.",
  "Ahorristas urbanos con pocas opciones para invertir en activos reales.",
];

const solutionPoints = [
  "Fideicomiso como resguardo patrimonial y separacion de riesgos.",
  "Tokenizacion fraccionada de tierra, cosecha y ganado sobre Stellar.",
  "Trazabilidad legal y financiera con validaciones institucionales.",
];

const benefitCards = [
  {
    icon: Building2,
    title: "Propietarios",
    description: "Obtienen liquidez sin vender su campo, manteniendo titularidad y acelerando productividad.",
  },
  {
    icon: Coins,
    title: "Inversores",
    description: "Acceden a participaciones desde montos bajos en activos tangibles del agro.",
  },
  {
    icon: Landmark,
    title: "Cumplimiento",
    description: "Modelo estructurado bajo normativa argentina (CNV) y protocolizacion notarial.",
  },
];

export function LandingPage() {
  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(81,165,55,0.25),transparent_32%),radial-gradient(circle_at_84%_10%,rgba(220,169,62,0.25),transparent_30%),radial-gradient(circle_at_50%_86%,rgba(51,80,120,0.2),transparent_34%)]" />

      <section className="relative min-h-[calc(100vh-74px)] w-full">
        <WheatFieldBackdrop />

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-74px)] w-full max-w-7xl items-center gap-10 px-5 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:gap-12 lg:py-20">
          <FadeIn>
            <span className="terra-badge">
              <Sprout size={15} /> Tokenizacion de tierras, campo y cultivos en Stellar
            </span>
            <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.02] text-white md:text-6xl lg:text-7xl">
              Capital real para el agro, con seguridad legal y trazabilidad digital.
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-[color:color-mix(in_oklab,white_80%,var(--color-muted))] md:text-lg">
              Terra Capital transforma participaciones fiduciarias en tokens digitales vinculantes. Combinamos fideicomiso,
              cumplimiento regulatorio y tecnologia blockchain para conectar ahorro urbano con produccion rural.
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/auth/login">
                <Button className="h-11 gap-2 px-6 text-base">
                  Empezar con wallet <ArrowRight size={17} />
                </Button>
              </Link>
              <Link href="/auth/login">
                <Button variant="outline" className="h-11 border-white/30 bg-black/20 px-6 text-base text-white hover:bg-black/35">
                  Iniciar sesion
                </Button>
              </Link>
            </div>
          </FadeIn>

          <FadeIn delay={0.12}>
            <Card className="relative max-w-xl overflow-hidden bg-[color:color-mix(in_oklab,var(--color-surface)_84%,transparent)] backdrop-blur-sm lg:ml-auto">
              <div className="absolute right-0 top-0 h-28 w-28 translate-x-10 -translate-y-10 rounded-full bg-[var(--color-accent)]/30 blur-2xl" />
              <h2 className="text-xl font-bold">Arquitectura de confianza</h2>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--color-muted)]">
                <li className="flex gap-2"><ShieldCheck size={18} className="mt-0.5 text-[var(--color-primary)]" /> Activos en resguardo dentro de fideicomiso.</li>
                <li className="flex gap-2"><BadgeCheck size={18} className="mt-0.5 text-[var(--color-primary)]" /> Participaciones tokenizadas con derechos economicos.</li>
                <li className="flex gap-2"><Wallet size={18} className="mt-0.5 text-[var(--color-primary)]" /> Custodia en wallet legalmente vinculada por escribania.</li>
              </ul>
            </Card>
          </FadeIn>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-7 px-5 pb-16 pt-10 md:grid-cols-2 md:gap-8">
        <FadeIn>
          <Card className="h-full">
            <h3 className="text-xl font-bold">Problema</h3>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--color-muted)]">
              {problemPoints.map((point) => (
                <li key={point} className="flex gap-2">
                  <span className="mt-2 h-2 w-2 rounded-full bg-[var(--color-gold)]" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </Card>
        </FadeIn>

        <FadeIn delay={0.1}>
          <Card className="h-full">
            <h3 className="text-xl font-bold">Solucion</h3>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--color-muted)]">
              {solutionPoints.map((point) => (
                <li key={point} className="flex gap-2">
                  <span className="mt-2 h-2 w-2 rounded-full bg-[var(--color-primary)]" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </Card>
        </FadeIn>
      </section>

      <section id="detalles" className="mx-auto w-full max-w-7xl px-5 pb-16">
        <FadeIn>
          <h3 className="text-3xl font-black md:text-4xl">Fideicomiso Tokenizado</h3>
          <p className="mt-4 max-w-3xl text-[var(--color-muted)]">
            Cada token representa una participacion juridica sobre utilidades del rubro (tierra, grano o carne). La
            estructura separa patrimonio personal y patrimonio productivo para proteger al inversor y al productor.
          </p>
        </FadeIn>

        <div className="mt-7 grid gap-5 md:grid-cols-3">
          {benefitCards.map((item, index) => (
            <FadeIn key={item.title} delay={0.08 * index}>
              <Card>
                <item.icon size={22} className="text-[var(--color-primary)]" />
                <h4 className="mt-3 text-lg font-bold">{item.title}</h4>
                <p className="mt-2 text-sm text-[var(--color-muted)]">{item.description}</p>
              </Card>
            </FadeIn>
          ))}
        </div>
      </section>
    </main>
  );
}
