"use client";

import Link from "next/link";
import { ArrowRight, BadgeCheck, Building2, Coins, Landmark, ShieldCheck, Sprout, Wallet } from "lucide-react";
import { useLanguage } from "@/components/providers/language-provider";
import { WheatFieldBackdrop } from "@/features/landing/components/wheat-field-backdrop";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FadeIn } from "@/components/ui/fade-in";

const copyByLanguage = {
  es: {
    badge: "Tokenizacion de tierras, campo y cultivos en Stellar",
    title: "Capital real para el agro, con seguridad legal y trazabilidad digital.",
    description:
      "Terra Capital transforma participaciones fiduciarias en tokens digitales vinculantes. Combinamos fideicomiso, cumplimiento regulatorio y tecnologia blockchain para conectar ahorro urbano con produccion rural.",
    ctaPrimary: "Empezar con wallet",
    ctaSecondary: "Iniciar sesion",
    trustTitle: "Arquitectura de confianza",
    trustPoints: [
      "Activos en resguardo dentro de fideicomiso.",
      "Participaciones tokenizadas con derechos economicos.",
      "Custodia en wallet legalmente vinculada por escribania.",
    ],
    problemTitle: "Problema",
    solutionTitle: "Solucion",
    detailsTitle: "Fideicomiso Tokenizado",
    detailsDescription:
      "Cada token representa una participacion juridica sobre utilidades del rubro (tierra, grano o carne). La estructura separa patrimonio personal y patrimonio productivo para proteger al inversor y al productor.",
    problemPoints: [
      "Desplazamiento generacional y tierras productivas subutilizadas.",
      "Mercado inmobiliario rural lento y sin liquidez para propietarios.",
      "Ahorristas urbanos con pocas opciones para invertir en activos reales.",
    ],
    solutionPoints: [
      "Fideicomiso como resguardo patrimonial y separacion de riesgos.",
      "Tokenizacion fraccionada de tierra, cosecha y ganado sobre Stellar.",
      "Trazabilidad legal y financiera con validaciones institucionales.",
    ],
    benefitCards: [
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
    ],
  },
  en: {
    badge: "Tokenized land, fields and crops on Stellar",
    title: "Real capital for agriculture, with legal certainty and digital traceability.",
    description:
      "Terra Capital turns trust-backed participations into binding digital tokens. We combine fiduciary structure, regulatory compliance and blockchain technology to connect urban savings with rural production.",
    ctaPrimary: "Start with wallet",
    ctaSecondary: "Sign in",
    trustTitle: "Trust architecture",
    trustPoints: [
      "Assets protected inside a fiduciary structure.",
      "Tokenized participations with economic rights.",
      "Wallet custody legally linked through notarial process.",
    ],
    problemTitle: "Problem",
    solutionTitle: "Solution",
    detailsTitle: "Tokenized trust",
    detailsDescription:
      "Each token represents a legal participation in profits from the asset class. The structure separates personal and productive capital to protect both investor and producer.",
    problemPoints: [
      "Generational displacement and underused productive land.",
      "Slow rural real estate market with low liquidity for owners.",
      "Urban savers with few ways to access real productive assets.",
    ],
    solutionPoints: [
      "Fiduciary structure as risk separation and asset shelter.",
      "Fractional tokenization of land, harvest and livestock on Stellar.",
      "Legal and financial traceability with institutional validation.",
    ],
    benefitCards: [
      {
        icon: Building2,
        title: "Owners",
        description: "Unlock liquidity without selling the land, while preserving title and accelerating productivity.",
      },
      {
        icon: Coins,
        title: "Investors",
        description: "Access tangible agricultural assets with lower ticket sizes.",
      },
      {
        icon: Landmark,
        title: "Compliance",
        description: "Structured model aligned with Argentine regulation and notarial protocol.",
      },
    ],
  },
  pt: {
    badge: "Tokenizacao de terras, campo e cultivos na Stellar",
    title: "Capital real para o agro, com seguranca juridica e rastreabilidade digital.",
    description:
      "Terra Capital transforma participacoes fiduciarias em tokens digitais vinculantes. Combinamos fideicomisso, conformidade regulatoria e tecnologia blockchain para conectar poupanca urbana com producao rural.",
    ctaPrimary: "Comecar com wallet",
    ctaSecondary: "Entrar",
    trustTitle: "Arquitetura de confianca",
    trustPoints: [
      "Ativos protegidos dentro do fideicomisso.",
      "Participacoes tokenizadas com direitos economicos.",
      "Custodia em wallet vinculada legalmente por cartorio.",
    ],
    problemTitle: "Problema",
    solutionTitle: "Solucao",
    detailsTitle: "Fideicomisso tokenizado",
    detailsDescription:
      "Cada token representa uma participacao juridica sobre utilidades do ativo. A estrutura separa patrimonio pessoal e produtivo para proteger investidor e produtor.",
    problemPoints: [
      "Mudanca geracional e terras produtivas subutilizadas.",
      "Mercado imobiliario rural lento e sem liquidez para proprietarios.",
      "Poupadores urbanos com poucas opcoes de investir em ativos reais.",
    ],
    solutionPoints: [
      "Fideicomisso como resguardo patrimonial e separacao de riscos.",
      "Tokenizacao fracionada de terra, colheita e gado na Stellar.",
      "Rastreabilidade juridica e financeira com validacao institucional.",
    ],
    benefitCards: [
      {
        icon: Building2,
        title: "Proprietarios",
        description: "Ganham liquidez sem vender o campo, mantendo titularidade e acelerando produtividade.",
      },
      {
        icon: Coins,
        title: "Investidores",
        description: "Acessam participacoes em ativos tangiveis do agro com menor ticket.",
      },
      {
        icon: Landmark,
        title: "Conformidade",
        description: "Modelo estruturado sob regulacao argentina e protocolo notarial.",
      },
    ],
  },
  fr: {
    badge: "Tokenisation des terres, cultures et exploitations sur Stellar",
    title: "Du capital reel pour l'agriculture, avec securite juridique et tracabilite numerique.",
    description:
      "Terra Capital transforme des participations fiduciaires en tokens numeriques opposables. Nous combinons structure fiduciaire, conformite reglementaire et blockchain pour relier epargne urbaine et production rurale.",
    ctaPrimary: "Commencer avec wallet",
    ctaSecondary: "Se connecter",
    trustTitle: "Architecture de confiance",
    trustPoints: [
      "Actifs proteges dans une structure fiduciaire.",
      "Participations tokenisees avec droits economiques.",
      "Conservation en wallet liee juridiquement par acte notarie.",
    ],
    problemTitle: "Probleme",
    solutionTitle: "Solution",
    detailsTitle: "Fiducie tokenisee",
    detailsDescription:
      "Chaque token represente une participation juridique sur les revenus de l'actif. La structure separe patrimoine personnel et patrimoine productif pour proteger investisseur et producteur.",
    problemPoints: [
      "Transition generationnelle et terres productives sous-utilisees.",
      "Marche immobilier rural lent et peu liquide pour les proprietaires.",
      "Peu d'options pour les epargnants urbains voulant investir dans des actifs reels.",
    ],
    solutionPoints: [
      "Structure fiduciaire pour separer les risques et proteger l'actif.",
      "Tokenisation fractionnee de la terre, des recoltes et de l'elevage sur Stellar.",
      "Tracabilite juridique et financiere avec validation institutionnelle.",
    ],
    benefitCards: [
      {
        icon: Building2,
        title: "Proprietaires",
        description: "Obtiennent de la liquidite sans vendre leur terre, tout en conservant le titre.",
      },
      {
        icon: Coins,
        title: "Investisseurs",
        description: "Accedent a des actifs agricoles tangibles avec des tickets plus bas.",
      },
      {
        icon: Landmark,
        title: "Conformite",
        description: "Modele structure selon la reglementation argentine et le protocole notarie.",
      },
    ],
  },
} as const;

export function LandingPage() {
  const { language } = useLanguage();
  const t = copyByLanguage[language];

  return (
    <main className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_20%,rgba(81,165,55,0.25),transparent_32%),radial-gradient(circle_at_84%_10%,rgba(220,169,62,0.25),transparent_30%),radial-gradient(circle_at_50%_86%,rgba(51,80,120,0.2),transparent_34%)]" />

      <section className="relative min-h-[calc(100vh-74px)] w-full">
        <WheatFieldBackdrop />

        <div className="relative z-10 mx-auto grid min-h-[calc(100vh-74px)] w-full max-w-7xl items-center gap-8 px-4 pb-16 pt-32 sm:px-5 lg:grid-cols-[1.2fr_0.8fr] lg:gap-12 lg:pb-20 lg:pt-36">
          <div>
            <span className="terra-badge">
              <Sprout size={15} /> {t.badge}
            </span>
            <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.02] text-white md:text-6xl lg:text-7xl">
              {t.title}
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-relaxed text-[color:color-mix(in_oklab,white_80%,var(--color-muted))] md:text-lg">
              {t.description}
            </p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link href="/auth/login">
                <Button className="h-11 gap-2 px-6 text-base">
                  {t.ctaPrimary} <ArrowRight size={17} />
                </Button>
              </Link>
              <Link href="/auth/login">
                <Button variant="outline" className="h-11 border-white/30 bg-black/20 px-6 text-base text-white hover:bg-black/35">
                  {t.ctaSecondary}
                </Button>
              </Link>
            </div>
          </div>

          <FadeIn delay={0.12}>
            <Card className="relative max-w-xl overflow-hidden bg-[color:color-mix(in_oklab,var(--color-surface)_84%,transparent)] backdrop-blur-sm lg:ml-auto">
              <div className="absolute right-0 top-0 h-28 w-28 translate-x-10 -translate-y-10 rounded-full bg-[var(--color-accent)]/30 blur-2xl" />
              <h2 className="text-xl font-bold">{t.trustTitle}</h2>
              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--color-muted)]">
                <li className="flex gap-2"><ShieldCheck size={18} className="mt-0.5 text-[var(--color-primary)]" /> {t.trustPoints[0]}</li>
                <li className="flex gap-2"><BadgeCheck size={18} className="mt-0.5 text-[var(--color-primary)]" /> {t.trustPoints[1]}</li>
                <li className="flex gap-2"><Wallet size={18} className="mt-0.5 text-[var(--color-primary)]" /> {t.trustPoints[2]}</li>
              </ul>
            </Card>
          </FadeIn>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-7 px-4 pb-16 pt-10 sm:px-5 md:grid-cols-2 md:gap-8">
        <FadeIn>
          <Card className="h-full">
            <h3 className="text-xl font-bold">{t.problemTitle}</h3>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--color-muted)]">
              {t.problemPoints.map((point) => (
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
            <h3 className="text-xl font-bold">{t.solutionTitle}</h3>
            <ul className="mt-4 space-y-3 text-sm leading-relaxed text-[var(--color-muted)]">
              {t.solutionPoints.map((point) => (
                <li key={point} className="flex gap-2">
                  <span className="mt-2 h-2 w-2 rounded-full bg-[var(--color-primary)]" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </Card>
        </FadeIn>
      </section>

      <section id="detalles" className="mx-auto w-full max-w-7xl px-4 pb-16 sm:px-5">
        <FadeIn>
          <h3 className="text-3xl font-black md:text-4xl">{t.detailsTitle}</h3>
          <p className="mt-4 max-w-3xl text-[var(--color-muted)]">
            {t.detailsDescription}
          </p>
        </FadeIn>

        <div className="mt-7 grid gap-5 md:grid-cols-3">
          {t.benefitCards.map((item, index) => (
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
