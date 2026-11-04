export const config = {
  api: {
    bodyParser: {
      sizeLimit: '20mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { url, pdfBase64 } = req.body;
  if (!url && !pdfBase64) {
    return res.status(400).json({ error: '기사 링크(URL) 또는 PDF 파일이 필요합니다.' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: '서버에 GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' });
  }

  // 전달된 데이터 유형에 따른 파츠 구성
  const parts = [];
  if (pdfBase64) {
    parts.push({
      inlineData: {
        mimeType: "application/pdf",
        data: pdfBase64
      }
    });
  }

  const targetDescription = url ? `기사 링크 URL: ${url}` : "첨부된 PDF 문서";
  parts.push({
    text: `다음 ${targetDescription}을 분석해서 1) 팩트체크 및 신뢰도, 2) 초등학생도 이해하는 쉬운 말 해설, 3) 3줄 요약, 4) 4장짜리 카드뉴스 구성안을 작성해 줘. 

반드시 순수 JSON 형태로만 응답해 (마크다운 백틱 금지):
{
  "factCheck": {
    "verdict": "진짜정보 | 가짜정보 의심 | 판단보류",
    "score": 90,
    "reason": "판단 이유 상세 설명"
  },
  "card1_easyExplanation": "초등학생 눈높이 해설 (비유와 예시 포함)",
  "card2_threeLines": ["요약1", "요약2", "요약3"],
  "card3_snsSlides": [
    {"slide": 1, "title": "제목", "content": "내용"},
    {"slide": 2, "title": "제목", "content": "내용"},
    {"slide": 3, "title": "제목", "content": "내용"},
    {"slide": 4, "title": "제목", "content": "내용"}
  ]
}`
  });

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Gemini API 호출 실패');
    }

    const data = await response.json();
    const rawText = data.candidates[0].content.parts[0].text;
    
    // 혹시 모를 마크다운 백틱 제거 후 JSON 파싱
    const cleanJsonText = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsedData = JSON.parse(cleanJsonText);

    return res.status(200).json(parsedData);
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message || '서버 분석 중 오류가 발생했습니다.' });
  }
}
