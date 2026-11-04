export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb', // 대용량 PDF 업로드 허용
    },
  },
};

export default async function handler(req, res) {
  // POST 요청만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { type, pdfBase64, url } = req.body;
  
  // 서버 환경변수에서 GEMINI_API_KEY 가져오기
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '서버 환경변수에 GEMINI_API_KEY가 설정되지 않았습니다. Vercel Settings에서 등록해 주세요.' });
  }

  const promptText = `
당신은 베테랑 팩트체크 전문 기자이자 쉬운 설명의 달인입니다.
제공된 문서(또는 URL 정보)를 정밀 분석하여 반드시 지정된 JSON 구조로만 답변해주세요. 마크다운 백틱(\`\`\`json 등)은 절대 포함하지 말고 순수 JSON 문자열만 반환하세요.

[필수 요구 응답 형식 (JSON Schema)]
{
  "factCheck": {
    "verdict": "진짜뉴스 (높은 신뢰도) | 가짜뉴스 의심 | 판단 보류",
    "score": 90,
    "reason": "신뢰도 판단 기준 및 근거 요약 설명",
    "relatedArticles": [
      {
        "title": "교차 검증 관련 기사 제목 1",
        "url": "https://example.com/news1",
        "perspective": "다른 관점 또는 보완 사실"
      },
      {
        "title": "관련 후속 기사 제목 2",
        "url": "https://example.com/news2",
        "perspective": "추가 데이터"
      }
    ]
  },
  "card1_easyExplanation": "초등학생(10세)도 쉽게 이해할 수 있는 비유와 일상생활 속 예시를 든 해설 (3~4문장)",
  "card2_threeLines": [
    "핵심 요약 1번째 줄",
    "핵심 요약 2번째 줄",
    "핵심 요약 3번째 줄"
  ],
  "card3_snsSlides": [
    { "slide": 1, "title": "슬라이드1 제목 (임팩트 헤드라인)", "content": "내용 요약 2줄" },
    { "slide": 2, "title": "슬라이드2 제목 (핵심 사건/이슈)", "content": "내용 요약 2줄" },
    { "slide": 3, "title": "슬라이드3 제목 (근거 및 주요데이터)", "content": "내용 요약 2줄" },
    { "slide": 4, "title": "슬라이드4 제목 (결론 및 시사점)", "content": "내용 요약 2줄" }
  ]
}
`;

  const parts = [];
  if (type === 'pdf' && pdfBase64) {
    parts.push({
      inlineData: {
        mimeType: "application/pdf",
        data: pdfBase64
      }
    });
    parts.push({ text: promptText });
  } else if (type === 'url' && url) {
    parts.push({ text: `분석 대상 기사 URL: ${url}\n\n${promptText}` });
  } else {
    return res.status(400).json({ error: '유효한 PDF 데이터 또는 URL이 제공되지 않았습니다.' });
  }

  const payload = {
    contents: [{ parts: parts }],
    generationConfig: {
      responseMimeType: "application/json"
    }
  };

  try {
    // 가장 안정적인 최신 gemini-1.5-flash 엔드포인트 사용
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (e) {
      throw new Error(`Gemini API 응답 파싱 실패: ${responseText.substring(0, 100)}`);
    }

    if (!response.ok) {
      const errorMsg = result.error?.message || `Gemini API 호출 실패 (Status: ${response.status})`;
      throw new Error(errorMsg);
    }

    const jsonText = result.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!jsonText) {
      throw new Error('AI 모델로부터 올바른 텍스트 응답을 받지 못했습니다.');
    }

    // 혹시 모를 마크다운 백틱 제거 후 안전하게 파싱
    const cleanJsonText = jsonText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanJsonText);

    return res.status(200).json(parsedData);
  } catch (error) {
    console.error('Analysis API Error:', error);
    return res.status(500).json({ error: error.message || '서버 분석 처리 중 오류가 발생했습니다.' });
  }
}
