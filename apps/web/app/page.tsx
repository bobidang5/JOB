/**
 * 落地页。
 *
 * 这个 Next.js 应用的主要职责是 AI 接口与 OAuth 回调，页面本身只是一个
 * 说明入口——产品是 iOS App。
 */
export default function HomePage() {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        textAlign: 'center',
      }}
    >
      <h1 style={{ fontSize: 32, fontWeight: 800, letterSpacing: -0.5, margin: 0 }}>
        职优 AI
      </h1>
      <p style={{ fontSize: 14, color: '#8E8E93', marginTop: 8 }}>
        三步让简历更贴合目标职位
      </p>
      <p style={{ fontSize: 13, color: '#AEAEB2', marginTop: 32, maxWidth: 420, lineHeight: 1.8 }}>
        这里是服务端：简历解析、匹配度分析与优化建议的接口，以及 OAuth 回调。
        产品本体是 iOS App。
      </p>
    </main>
  );
}
