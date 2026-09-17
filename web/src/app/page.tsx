import { FeaturePhoto, ScenePhoto } from "@/components/lp-art";
import { HeroSlider } from "@/components/hero-slider";
import { Reveal } from "@/components/reveal";
import {
  Card,
  Container,
  LinkButton,
  Section,
  SectionHeading,
} from "@/components/ui";
import { BILLING_PLAN_LIST } from "@/config/plans";

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
    a: "ユーザーが入力した情報をデータベース化し、エリアや築年数ごとの実質利回りの平均値を算出。その平均利回りを基に、収益還元法を用いて相場価格を算出しています。基準となるデータベースは随時更新しています。",
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

const FEATURES = [
  {
    src: "/images/feat-calc.jpg",
    alt: "物件の数字を資料と照合しながら確認している様子",
    title: "収益還元法を元に相場価格を算出",
    body: "ユーザーが入力した情報をデータベース化し、エリアや築年数ごとの実質利回りの平均値を算出。その平均利回りを基に、収益還元法を用いて相場価格を算出しています。",
  },
  {
    src: "/images/feat-docs.jpg",
    alt: "空室のワンルームで物件資料を手元に確認している様子",
    title: "データがない条件では診断しません",
    body: "基準となるデータが用意できていない条件については、推測で数値を埋めることはせず、その旨をお伝えします。無料診断の回数も消費しません。",
  },
  {
    src: "/images/feat-private.jpg",
    alt: "入力した物件情報を本人だけが確認している様子",
    title: "リアルタイムの相場価格を確認できます",
    body: "ワンルーム投資の市況は数ヶ月単位で大きく変化します。基準となるデータベースは随時更新されるため、最新の相場価格を確認することができます。",
  },
  {
    src: "/images/feat-building.jpg",
    alt: "診断の対象となるワンルームマンションの外観",
    title: "結果は参考情報です",
    body: "実際の売買価格は、物件の個別事情や交渉によって変わります。本サービスの結果は投資成果を保証するものではありません。",
  },
];

export default function LandingPage() {
  return (
    <>
      <HeroSlider />

      <Section id="about">
        <Reveal>
          <SectionHeading
            eyebrow="ワンマケとは"
            title="判定・相場価格・差額を、このサービスひとつで確認できます"
            description="ワンルーム投資の提案を受けたとき、提示された価格が妥当なのかを判断する材料はなかなか手に入りません。ワンマケは、エリアと築年数ごとの基準データをもとに、その物件の相場価格をお示しします。"
          />
        </Reveal>
        <ul className="grid gap-4 sm:grid-cols-3">
          {[
            { title: "判定", body: "割安・相場通り・割高の3段階" },
            { title: "相場価格", body: "エリアと築年数から見た価格の幅" },
            { title: "差額", body: "提示価格との差を万円で表示" },
          ].map((item, index) => (
            <Reveal as="li" key={item.title} className="h-full" delay={index * 80}>
              <Card className="lp-lift h-full">
                <h3 className="text-base font-bold text-ink-900">{item.title}</h3>
                <p className="mt-2 text-sm text-ink-500">{item.body}</p>
              </Card>
            </Reveal>
          ))}
        </ul>
        <Reveal>
          <div className="mt-10 text-center sm:mt-12">
            <p className="text-2xl font-bold leading-snug text-balance text-ink-900 sm:text-3xl">
              ワンマケは判定後の営業行為は一切ございません
            </p>
            <div className="mx-auto mt-4 max-w-2xl space-y-3 text-[15px] leading-relaxed text-ink-500">
              <p>
                多くの無料売却査定サイトは不動産会社が運営しており、物件を登録した後に営業電話がかかってくるケースが多いです。
              </p>
              <p>
                ワンマケは不動産取引で利益を得ておらず、有料プランをご利用頂いている皆様のおかげで成立しているサービスです。
              </p>
            </div>
          </div>
        </Reveal>
      </Section>

      <Section id="scenes" muted>
        <Reveal>
          <SectionHeading
            title="こんなときに使えます"
            description="資料の数字を転記するだけで、提示価格の位置づけを揃えられます。"
          />
        </Reveal>
        <div className="grid gap-4 md:grid-cols-2">
          <Reveal>
            <article className="lp-lift overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
              <ScenePhoto
                src="/images/scene-review.jpg"
                alt="提案資料を見ながら相場を確認している様子"
              />
              <div className="p-6">
                <p className="text-xs font-bold text-brand-700">提案を受けた直後</p>
                <h3 className="mt-2 text-lg font-bold text-ink-900">
                  提示価格を、相場との位置で見る
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                  駅・築年・価格・賃料を入れると、判定と相場価格の幅が出ます。初回は無料です。
                </p>
              </div>
            </article>
          </Reveal>
          <Reveal delay={90}>
            <article className="lp-lift overflow-hidden rounded-2xl border border-[var(--color-line)] bg-white">
              <ScenePhoto
                src="/images/scene-compare.jpg"
                alt="複数物件の提示価格を比較している様子"
              />
              <div className="p-6">
                <p className="text-xs font-bold text-brand-700">売却相場も確認可能</p>
                <h3 className="mt-2 text-lg font-bold text-ink-900">
                  所有物件の現在の相場を確認したい時
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">
                  2回目以降は有料プランです。履歴はマイページに残るので、あとから見返せます。
                </p>
              </div>
            </article>
          </Reveal>
        </div>
      </Section>

      <Section id="flow" className="bg-brand-500">
        <Reveal>
          <SectionHeading
            tone="inverse"
            eyebrow="ご利用の流れ"
            title="3つのステップで完了します"
          />
        </Reveal>
        <ol className="grid gap-4 md:grid-cols-3">
          {[
            {
              title: "物件情報を入力",
              body: "最寄り駅・築年数・価格・賃料など、資料に書かれている内容をそのまま入力します。",
            },
            {
              title: "会員登録（初回のみ）",
              body: "診断結果をお届けするために、メールアドレスとパスワードをご登録ください。",
            },
            {
              title: "診断結果を確認",
              body: "判定・相場価格・提示価格との差額を表示します。履歴はマイページから見返せます。",
            },
          ].map((step, index) => (
            <Reveal as="li" key={step.title} className="h-full" delay={index * 80}>
              <Card className="lp-lift h-full border-transparent">
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-500 text-sm font-bold text-white">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-base font-bold text-ink-900">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-500">{step.body}</p>
              </Card>
            </Reveal>
          ))}
        </ol>
      </Section>

      <Section id="plans" muted>
        <Reveal>
          <SectionHeading
            eyebrow="料金"
            title="初回は無料。2回目以降は用途に合わせて選べます"
          />
        </Reveal>
        <div className="grid gap-4 lg:grid-cols-2">
          <Reveal>
            <Card className="lp-lift h-full border-brand-200 bg-brand-50">
              <p className="text-sm font-bold text-brand-700">初めての方</p>
              <p className="mt-2 text-3xl font-bold text-ink-900">初回無料</p>
              <p className="mt-3 text-sm leading-relaxed text-ink-500">
                1回目の診断は無料です。入力した物件情報はそのまま引き継がれます。
              </p>
              <div className="mt-6">
                <LinkButton href="/diagnosis/new" className="w-full">
                  無料で相場を確認してみる
                </LinkButton>
              </div>
            </Card>
          </Reveal>
          <Reveal delay={90}>
            <Card className="lp-lift h-full">
              <p className="text-sm font-bold text-ink-700">2回目以降</p>
              <p className="mt-2 text-3xl font-bold text-ink-900">有料プラン</p>
              <ul className="mt-5 space-y-3">
                {BILLING_PLAN_LIST.map((plan) => (
                  <li
                    key={plan.key}
                    className="rounded-xl bg-[var(--color-surface-muted)] px-4 py-3"
                  >
                    <p className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-bold text-ink-900">{plan.name}</span>
                      <span className="text-sm font-bold text-brand-700">
                        {plan.priceLabel}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-ink-500">{plan.description}</p>
                  </li>
                ))}
              </ul>
            </Card>
          </Reveal>
        </div>
      </Section>

      <Section id="trust">
        <Reveal>
          <SectionHeading
            eyebrow="安心材料"
            title="診断の前提を、先に確認できます"
          />
        </Reveal>
        <div className="space-y-4">
          {FEATURES.map((item, index) => (
            <Reveal key={item.title} delay={index * 60}>
              <article className="lp-lift grid items-center gap-6 rounded-2xl border border-[var(--color-line)] bg-white p-5 sm:grid-cols-[auto_1fr] sm:p-7">
                <FeaturePhoto src={item.src} alt={item.alt} />
                <div>
                  <h3 className="text-lg font-bold text-ink-900">{item.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-ink-500">{item.body}</p>
                </div>
              </article>
            </Reveal>
          ))}
        </div>
      </Section>

      <Section id="faq" muted>
        <Reveal>
          <SectionHeading eyebrow="よくあるご質問" title="ご利用前に確認できます" />
          <div className="mx-auto max-w-3xl divide-y divide-[var(--color-line)] border-y border-[var(--color-line)]">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-4">
                <summary className="flex min-h-11 cursor-pointer items-start gap-3 py-1 text-[15px] font-bold text-ink-900 marker:content-['']">
                  <span className="flex-1">{item.q}</span>
                  <span aria-hidden className="text-ink-300 transition-transform duration-300 group-open:rotate-180">
                    ▾
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-ink-500">{item.a}</p>
              </details>
            ))}
          </div>
        </Reveal>
      </Section>

      <section className="bg-surface-warm py-14 sm:py-16">
        <Container className="text-center">
          <Reveal>
            <h2 className="text-xl font-bold text-ink-900 sm:text-2xl">
              提示価格が相場と比べてどうか、確認してみる
            </h2>
            <p className="mt-3 text-sm text-ink-500">
              入力は1〜2分です。
            </p>
            <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <LinkButton href="/diagnosis/new">無料で相場を確認してみる</LinkButton>
              <LinkButton href="/login" variant="accent">
                ログイン
              </LinkButton>
            </div>
          </Reveal>
        </Container>
      </section>
    </>
  );
}
