import Link from "next/link";

import {
  Card,
  Container,
  DefinitionRow,
  LinkButton,
  Section,
  SectionHeading,
} from "@/components/ui";

const ANCHORS = [
  { href: "#about", label: "ワンマケとは" },
  { href: "#value", label: "わかること" },
  { href: "#flow", label: "ご利用の流れ" },
  { href: "#trust", label: "安心してお使いいただくために" },
  { href: "#faq", label: "よくあるご質問" },
];

const VALUE_ITEMS = [
  {
    title: "割安・相場通り・割高がひと目でわかる",
    body: "提示された価格が、同じエリア・築年数の水準と比べてどの位置にあるのかを3段階で表示します。",
  },
  {
    title: "相場価格を金額の幅で表示",
    body: "「いくらくらいが相場なのか」を価格帯で示すので、提示価格との差が具体的につかめます。",
  },
  {
    title: "提示価格との差額がわかる",
    body: "相場と比べて何万円ほど高い（安い）のかを表示します。検討や交渉の材料としてお使いいただけます。",
  },
];

const FLOW_STEPS = [
  {
    title: "物件情報を入力",
    body: "最寄り駅・築年数・価格・賃料など、資料に書かれている内容をそのまま入力します。1〜2分ほどで終わります。",
  },
  {
    title: "会員登録（初回のみ）",
    body: "診断結果をお届けするために、メールアドレスとパスワードをご登録ください。入力した物件情報はそのまま引き継がれます。",
  },
  {
    title: "診断結果を確認",
    body: "判定・相場価格・提示価格との差額を表示します。結果はマイページからいつでも見返せます。",
  },
];

const FAQ = [
  {
    q: "利用にお金はかかりますか？",
    a: "初回の診断は無料でご利用いただけます。2回目以降は有料です。1回プランは1,100円、月5回までプランは2,200円/月、回数無制限プランは5,500円/月です。",
  },
  {
    q: "どのエリアに対応していますか？",
    a: "東京・埼玉・神奈川・千葉、大阪・京都・兵庫、福岡、愛知に加えて、その他の道府県にも対応しています。エリアと築年数の組み合わせによっては、基準となるデータをご用意できていない場合があります。",
  },
  {
    q: "診断結果はどのように算出していますか？",
    a: "月額賃料から管理費と修繕積立金を差し引いた実質的な収入をもとに、エリアと築年数ごとに定めた基準と照らし合わせて算出しています。基準となるデータは定期的に見直しています。",
  },
  {
    q: "入力した情報は他の人に見られますか？",
    a: "いいえ。入力いただいた物件情報と診断結果は、ご本人のアカウントからのみ閲覧できます。",
  },
  {
    q: "診断結果どおりの価格で売買できますか？",
    a: "本サービスの結果は参考情報です。実際の売買価格は物件の個別事情や交渉によって変わります。投資のご判断はご自身の責任でお願いいたします。",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* ---------------------------------------------------- ファーストビュー */}
      <div className="border-b border-[var(--color-line)] bg-gradient-to-b from-brand-50 to-white">
        <Container className="py-14 text-center sm:py-24">
          <p className="mb-4 inline-block rounded-full bg-white px-4 py-1 text-sm font-bold text-brand-700 shadow-[0_1px_3px_rgba(16,24,28,0.06)]">
            ワンルーム投資物件の価格診断
          </p>
          <h1 className="mx-auto max-w-3xl text-[26px] font-bold leading-tight text-ink-900 sm:text-[42px]">
            その提案価格は、
            <br className="sm:hidden" />
            <span className="text-brand-600">相場と比べてどうですか？</span>
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-ink-700 sm:text-base">
            物件の情報を入力するだけで、エリアと築年数から見た相場価格と、
            提示された価格との差を確認できます。初回は無料です。
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <LinkButton href="/diagnosis/new" className="w-full sm:w-auto">
              無料で相場を確認してみる
            </LinkButton>
            <LinkButton href="#flow" variant="secondary" className="w-full sm:w-auto">
              ご利用の流れを見る
            </LinkButton>
          </div>
          <p className="mt-4 text-xs text-ink-500">
            入力は1〜2分ほど／登録は診断結果を見る直前です
          </p>
        </Container>

        <nav
          aria-label="ページ内の目次"
          className="border-t border-[var(--color-line)] bg-white"
        >
          <Container>
            <ul className="flex gap-x-5 overflow-x-auto py-3 text-sm font-bold [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden sm:flex-wrap sm:justify-center sm:gap-x-7 sm:overflow-visible">
              {ANCHORS.map((anchor) => (
                <li key={anchor.href} className="shrink-0">
                  <Link
                    href={anchor.href}
                    className="flex items-center gap-2 whitespace-nowrap text-ink-700 hover:text-brand-600"
                  >
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full bg-brand-500"
                    />
                    {anchor.label}
                  </Link>
                </li>
              ))}
            </ul>
          </Container>
        </nav>
      </div>

      {/* --------------------------------------------------------- サービス説明 */}
      <Section id="about">
        <SectionHeading
          eyebrow="ワンマケとは"
          title="「この価格で本当にいいのか」を、自分で確かめられます"
          description="ワンルーム投資の提案を受けたとき、提示された価格が妥当なのかを判断する材料はなかなか手に入りません。ワンマケは、エリアと築年数ごとの基準データをもとに、その物件の相場価格をお示しします。"
        />
        <div className="grid gap-4 sm:grid-cols-3">
          {VALUE_ITEMS.map((item) => (
            <Card key={item.title}>
              <h3 className="text-base font-bold text-ink-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                {item.body}
              </p>
            </Card>
          ))}
        </div>
      </Section>

      {/* ----------------------------------------------------------- わかること */}
      <Section id="value" muted>
        <SectionHeading
          eyebrow="診断でわかること"
          title="結果はこのように表示されます"
        />
        <Card className="mx-auto max-w-2xl">
          <p className="text-sm text-ink-500">診断結果</p>
          <p className="mt-1 text-2xl font-bold text-ink-900">
            この物件は相場より高めです
          </p>
          <dl className="mt-6">
            <DefinitionRow term="判定">
              <span className="text-[var(--color-judge-over)]">割高</span>
            </DefinitionRow>
            <DefinitionRow term="相場価格">2,400万円〜2,500万円</DefinitionRow>
            <DefinitionRow term="提示価格">2,670万円</DefinitionRow>
          </dl>
          <p className="mt-5 rounded-xl bg-[var(--color-surface-muted)] px-4 py-3 text-sm text-ink-700">
            相場より 170万円〜270万円 ほど高い価格です
          </p>
          <p className="mt-3 text-xs text-ink-300">
            ※ 表示例です。実際の結果は入力内容によって変わります。
          </p>
        </Card>
      </Section>

      {/* --------------------------------------------------------------- 流れ */}
      <Section id="flow">
        <SectionHeading eyebrow="ご利用の流れ" title="3つのステップで完了します" />
        <ol className="grid gap-4 sm:grid-cols-3">
          {FLOW_STEPS.map((step, index) => (
            <Card as="li" key={step.title}>
              <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white">
                {index + 1}
              </span>
              <h3 className="mt-4 text-base font-bold text-ink-900">
                {step.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-500">
                {step.body}
              </p>
            </Card>
          ))}
        </ol>
        <div className="mt-10 text-center">
          <LinkButton href="/diagnosis/new" className="w-full sm:w-auto">
            無料で相場を確認してみる
          </LinkButton>
        </div>
      </Section>

      {/* ------------------------------------------------------------- 安心材料 */}
      <Section id="trust" muted>
        <SectionHeading
          eyebrow="安心してお使いいただくために"
          title="お伝えしていること"
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <h3 className="text-base font-bold text-ink-900">
              算出の考え方を公開しています
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              月額賃料から管理費と修繕積立金を差し引いた実質的な収入をもとに、
              エリアと築年数ごとの基準と照らし合わせて相場価格を算出しています。
              根拠のない数値や、あいまいな推定で結果を出すことはありません。
            </p>
          </Card>
          <Card>
            <h3 className="text-base font-bold text-ink-900">
              データがない条件では診断しません
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              基準となるデータが用意できていない条件については、
              推測で数値を埋めることはせず、その旨をお伝えします。
              無料診断の回数も消費しません。
            </p>
          </Card>
          <Card>
            <h3 className="text-base font-bold text-ink-900">
              入力内容はご本人だけが閲覧できます
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              物件情報と診断結果は、ご登録いただいたアカウントに紐づけて保管し、
              他の利用者から閲覧されることはありません。
            </p>
          </Card>
          <Card>
            <h3 className="text-base font-bold text-ink-900">
              結果は参考情報です
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-500">
              実際の売買価格は、物件の個別事情や交渉によって変わります。
              本サービスの結果は投資成果を保証するものではありません。
            </p>
          </Card>
        </div>
      </Section>

      {/* --------------------------------------------------------------- FAQ */}
      <Section id="faq">
        <SectionHeading eyebrow="よくあるご質問" title="ご利用前に確認できます" />
        <div className="mx-auto max-w-3xl divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
          {FAQ.map((item) => (
            <details key={item.q} className="group py-4">
              <summary className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-[15px] font-bold text-ink-900 marker:content-['']">
                <span aria-hidden className="mt-0.5 text-brand-500">
                  Q
                </span>
                <span className="flex-1">{item.q}</span>
                <span
                  aria-hidden
                  className="mt-0.5 shrink-0 text-ink-300 transition-transform group-open:rotate-180"
                >
                  ▾
                </span>
              </summary>
              <p className="mt-3 pl-7 text-sm leading-relaxed text-ink-500">
                {item.a}
              </p>
            </details>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------------------ 最終 CTA */}
      <Section muted>
        <Card className="text-center">
          <h2 className="text-xl font-bold text-ink-900 sm:text-2xl">
            提示された価格を、確かめてみませんか
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-ink-500">
            入力は1〜2分ほど。初回の診断は無料でご利用いただけます。
          </p>
          <div className="mt-6">
            <LinkButton href="/diagnosis/new" className="w-full sm:w-auto">
              無料で相場を確認してみる
            </LinkButton>
          </div>
        </Card>
      </Section>
    </>
  );
}
