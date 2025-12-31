// index.js - Teams Bot 서버 진입점

const restify = require('restify');
const { BotFrameworkAdapter } = require('botbuilder');
const { CardUsageBot } = require('./bot');
require('dotenv').config();

// =================================
// 서버 생성
// =================================
const server = restify.createServer();
server.use(restify.plugins.bodyParser());

// =================================
// Bot Framework 어댑터 설정
// =================================
const adapter = new BotFrameworkAdapter({
	appId: process.env.MicrosoftAppId,
	appPassword: process.env.MicrosoftAppPassword,
	appType: process.env.MicrosoftAppType,
	appTenantId: process.env.MicrosoftAppTenantId
});

// 에러 핸들러
adapter.onTurnError = async (context, error) => {
	console.error(`[onTurnError] 에러 발생:`, error);
	await context.sendActivity('⚠️ 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
};

// =================================
// 봇 인스턴스 생성
// =================================
const bot = new CardUsageBot();

// =================================
// 엔드포인트 설정
// =================================

// 메시지 엔드포인트 (Azure Bot에 등록하는 URL)
server.post('/api/messages', async (req, res) => {
	await adapter.process(req, res, (context) => bot.run(context));
});

// 상태 확인 엔드포인트
server.get('/health', (req, res, next) => {
	res.send(200, { 
		status: 'healthy', 
		timestamp: new Date().toISOString() 
	});
	return next();
});

// 루트 경로
server.get('/', (req, res, next) => {
	res.send(200, { 
		name: 'Teams 법인카드 사용내역 봇',
		status: 'running',
		endpoint: '/api/messages'
	});
	return next();
});

// =================================
// 서버 시작
// =================================
const PORT = process.env.PORT || 3978;
server.listen(PORT, () => {
	console.log(`\n==========================================`);
	console.log(`🤖 법인카드 사용내역 봇 서버 시작`);
	console.log(`==========================================`);
	console.log(`📍 로컬: http://localhost:${PORT}`);
	console.log(`📍 메시지 엔드포인트: /api/messages`);
	console.log(`💚 상태 확인: /health`);
	console.log(`==========================================\n`);
});