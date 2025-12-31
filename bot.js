// bot.js - 법인카드 사용내역 봇 (동적 추가/삭제)

const { ActivityHandler, CardFactory, TeamsInfo } = require('botbuilder');
const axios = require('axios');

class CardUsageBot extends ActivityHandler {
	constructor() {
		super();

		this.onMessage(async (context, next) => {
			const text = context.activity.text?.toLowerCase().trim() || '';
			
			// Adaptive Card 제출 처리
			if (context.activity.value) {
				await this.handleCardAction(context);
			}
			// 폼 요청
			else if (text.includes('등록') || text.includes('카드') || text.includes('사용')) {
				await this.sendCardUsageForm(context, 1); // 최초 1개
			}
			else {
				await context.sendActivity(
					`안녕하세요! 법인카드 사용내역 봇입니다. 💳\n\n` +
					`**"등록"**이라고 입력하면 사용내역을 등록할 수 있습니다.`
				);
			}
			
			await next();
		});

		this.onMembersAdded(async (context, next) => {
			for (const member of context.activity.membersAdded) {
				if (member.id !== context.activity.recipient.id) {
					await context.sendActivity(
						`👋 안녕하세요! **법인카드 사용내역 봇**입니다.\n\n` +
						`**"등록"**이라고 말씀해 주시면 사용내역을 등록할 수 있습니다.`
					);
				}
			}
			await next();
		});
	}

	// ⭐ 카드 액션 처리 (추가/삭제/제출)
	async handleCardAction(context) {
		const data = context.activity.value;
		const action = data.action;

		switch (action) {
			case 'addDetail':
				// 내역 추가 (최대 10개)
				await this.updateFormWithCount(context, data, Math.min(data.detailCount + 1, 10));
				break;

			case 'removeDetail':
				// 내역 삭제 (최소 1개)
				await this.updateFormWithCount(context, data, Math.max(data.detailCount - 1, 1));
				break;

			case 'submitCardUsage':
				// 최종 제출
				await this.handleFormSubmission(context, data);
				break;

			default:
				break;
		}
	}

	// ⭐ 폼 업데이트 (내역 개수 변경)
	async updateFormWithCount(context, previousData, newCount) {
		const cardChoices = await this.getCardList();
		
		// 이전 입력값 유지
		const formData = {
			lc_category: previousData.lc_category || '',
			lc_local: previousData.lc_local || '0',
			lc_type: previousData.lc_type || '0',
			lc_user: previousData.lc_user || '',
			team: previousData.team || '',
			details: []
		};

		// 기존 내역 데이터 유지
		for (let i = 1; i <= 10; i++) {
			formData.details.push({
				lc_date: previousData[`lc_date_${i}`] || '',
				lc_num: previousData[`lc_num_${i}`] || '',
				lc_item: previousData[`lc_item_${i}`] || '',
				lc_price: previousData[`lc_price_${i}`] || '',
				lc_comment: previousData[`lc_comment_${i}`] || ''
			});
		}

		const card = this.createCardUsageForm(cardChoices, formData, newCount);
		
		// 기존 카드 업데이트
		const activity = context.activity;
		const updatedActivity = {
			type: 'message',
			id: activity.replyToId,
			attachments: [CardFactory.adaptiveCard(card)]
		};

		await context.updateActivity(updatedActivity);
	}

	// Teams 사용자 정보 가져오기
	async getTeamsUserDetails(context) {
		try {
			const member = await TeamsInfo.getMember(context, context.activity.from.id);
			return {
				name: member.name || '',
				email: member.email || ''
			};
		} catch (error) {
			return {
				name: context.activity.from.name || '',
				email: ''
			};
		}
	}

	// 카드 목록 API
	async getCardList() {
		try {
			const response = await axios.get(process.env.CARD_LIST_API_URL);
			return response.data.map(card => ({
				title: card.card_name,
				value: card.no
			}));
		} catch (error) {
			return [
				{ title: "법인카드 1", value: "법인카드 1" },
				{ title: "법인카드 2", value: "법인카드 2" },
				{ title: "법인카드 3", value: "법인카드 3" }
			];
		}
	}

	// 부서 조회 API
	async getTeamByUser(userName) {
		try {
			const response = await axios.get(
				`${process.env.USER_TEAM_API_URL}?name=${encodeURIComponent(userName)}`
			);
			return response.data.team || '';
		} catch (error) {
			return '';
		}
	}

	// 폼 전송
	async sendCardUsageForm(context, detailCount = 1) {
		const cardChoices = await this.getCardList();
		const teamsUser = await this.getTeamsUserDetails(context);
		const team = await this.getTeamByUser(teamsUser.name);

		const formData = {
			lc_category: '',
			lc_local: '0',
			lc_type: '0',
			lc_user: teamsUser.name,
			team: team,
			details: Array(10).fill({
				lc_date: '', lc_num: '', lc_item: '', lc_price: '', lc_comment: ''
			})
		};

		const card = this.createCardUsageForm(cardChoices, formData, detailCount);
		
		await context.sendActivity({
			attachments: [CardFactory.adaptiveCard(card)]
		});
	}

	// ⭐ Adaptive Card 폼 생성 (동적 내역)
	createCardUsageForm(cardChoices, formData, detailCount) {
		const body = [
			// 헤더
			{
				"type": "TextBlock",
				"text": "💳 법인카드 사용내역 등록",
				"weight": "Bolder",
				"size": "Large",
				"color": "Accent"
			},
			{
				"type": "TextBlock",
				"text": "아래 양식을 작성해 주세요",
				"spacing": "None",
				"isSubtle": true
			},

			// 기본 정보 섹션
			{
				"type": "Container",
				"style": "emphasis",
				"spacing": "Medium",
				"items": [{ "type": "TextBlock", "text": "📌 기본 정보", "weight": "Bolder" }]
			},

			// 카드이름
			{ "type": "TextBlock", "text": "카드이름 *", "weight": "Bolder" },
			{
				"type": "Input.ChoiceSet",
				"id": "lc_category",
				"style": "compact",
				"isRequired": true,
				"placeholder": "카드를 선택하세요",
				"value": formData.lc_category,
				"choices": cardChoices
			},

			// 거래국가 & 거래종류
			{
				"type": "ColumnSet",
				"columns": [
					{
						"type": "Column",
						"width": "stretch",
						"items": [
							{ "type": "TextBlock", "text": "거래국가 *", "weight": "Bolder" },
							{
								"type": "Input.ChoiceSet",
								"id": "lc_local",
								"style": "expanded",
								"value": formData.lc_local,
								"choices": [
									{ "title": "🇰🇷 국내", "value": "0" },
									{ "title": "🌍 해외", "value": "1" }
								]
							}
						]
					},
					{
						"type": "Column",
						"width": "stretch",
						"items": [
							{ "type": "TextBlock", "text": "거래종류 *", "weight": "Bolder" },
							{
								"type": "Input.ChoiceSet",
								"id": "lc_type",
								"style": "expanded",
								"value": formData.lc_type,
								"choices": [
									{ "title": "💰 결제", "value": "0" },
									{ "title": "↩️ 취소", "value": "1" }
								]
							}
						]
					}
				]
			},

			// 사용자이름 & 부서
			{
				"type": "ColumnSet",
				"columns": [
					{
						"type": "Column",
						"width": "stretch",
						"items": [
							{ "type": "TextBlock", "text": "사용자이름 *", "weight": "Bolder" },
							{
								"type": "Input.Text",
								"id": "lc_user",
								"value": formData.lc_user,
								"isRequired": true
							}
						]
					},
					{
						"type": "Column",
						"width": "stretch",
						"items": [
							{ "type": "TextBlock", "text": "사용부서", "weight": "Bolder" },
							{
								"type": "Input.Text",
								"id": "team",
								"value": formData.team
							}
						]
					}
				]
			}
		];

		// ⭐ 사용내역 동적 생성
		for (let i = 1; i <= detailCount; i++) {
			const detail = formData.details[i - 1] || {};
			const isRequired = (i === 1); // 첫 번째만 필수

			body.push(
				// 섹션 헤더
				{
					"type": "Container",
					"style": "emphasis",
					"spacing": "Large",
					"items": [{
						"type": "TextBlock",
						"text": `📝 사용내역 ${i}${isRequired ? '' : ' (선택)'}`,
						"weight": "Bolder"
					}]
				},
				// 일자 & 인원
				{
					"type": "ColumnSet",
					"columns": [
						{
							"type": "Column",
							"width": "stretch",
							"items": [
								{ "type": "TextBlock", "text": `사용일자${isRequired ? ' *' : ''}`, "size": "Small" },
								{ 
									"type": "Input.Date", 
									"id": `lc_date_${i}`,
									"value": detail.lc_date || '',
									"isRequired": isRequired
								}
							]
						},
						{
							"type": "Column",
							"width": "stretch",
							"items": [
								{ "type": "TextBlock", "text": `사용인원${isRequired ? ' *' : ''}`, "size": "Small" },
								{ 
									"type": "Input.Number", 
									"id": `lc_num_${i}`, 
									"placeholder": "0",
									"value": detail.lc_num || '',
									"min": 1,
									"isRequired": isRequired
								}
							]
						}
					]
				},
				// 계정명 & 금액
				{
					"type": "ColumnSet",
					"columns": [
						{
							"type": "Column",
							"width": "stretch",
							"items": [
								{ "type": "TextBlock", "text": `계정명${isRequired ? ' *' : ''}`, "size": "Small" },
								{ 
									"type": "Input.Text", 
									"id": `lc_item_${i}`, 
									"placeholder": "식대, 교통비 등",
									"value": detail.lc_item || '',
									"isRequired": isRequired
								}
							]
						},
						{
							"type": "Column",
							"width": "stretch",
							"items": [
								{ "type": "TextBlock", "text": `사용금액${isRequired ? ' *' : ''}`, "size": "Small" },
								{ 
									"type": "Input.Number", 
									"id": `lc_price_${i}`, 
									"placeholder": "0",
									"value": detail.lc_price || '',
									"isRequired": isRequired
								}
							]
						}
					]
				},
				// 세부내용
				{ "type": "TextBlock", "text": "세부내용", "size": "Small" },
				{
					"type": "Input.Text",
					"id": `lc_comment_${i}`,
					"placeholder": "상세 내용을 입력하세요",
					"value": detail.lc_comment || '',
					"isMultiline": true
				}
			);
		}

		// ⭐ 추가/삭제 버튼 & 내역 개수 표시
		body.push({
			"type": "Container",
			"spacing": "Medium",
			"items": [
				{
					"type": "TextBlock",
					"text": `📊 현재 ${detailCount}건 입력 중 (최대 10건)`,
					"isSubtle": true,
					"horizontalAlignment": "Center"
				}
			]
		});

		// 액션 버튼
		const actions = [
			{
				"type": "Action.Submit",
				"title": "➕ 내역 추가",
				"style": "positive",
				"data": { 
					"action": "addDetail",
					"detailCount": detailCount
				}
			}
		];

		// 2개 이상일 때만 삭제 버튼 표시
		if (detailCount > 1) {
			actions.push({
				"type": "Action.Submit",
				"title": "➖ 마지막 삭제",
				"data": { 
					"action": "removeDetail",
					"detailCount": detailCount
				}
			});
		}

		// 제출 버튼
		actions.push({
			"type": "Action.Submit",
			"title": "✅ 제출하기",
			"style": "positive",
			"data": { 
				"action": "submitCardUsage",
				"detailCount": detailCount
			}
		});

		return {
			"$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
			"type": "AdaptiveCard",
			"version": "1.5",
			"body": body,
			"actions": actions
		};
	}

	// 폼 제출 처리
	async handleFormSubmission(context, formData) {
		// 필수 필드 확인
		if (!formData.lc_category || !formData.lc_user || !formData.lc_date_1) {
			await context.sendActivity('⚠️ 필수 항목을 모두 입력해 주세요.');
			return;
		}

		// 사용내역 배열로 정리
		const usageDetails = [];
		for (let i = 1; i <= formData.detailCount; i++) {
			if (formData[`lc_date_${i}`]) {
				usageDetails.push({
					lc_date: formData[`lc_date_${i}`],
					lc_num: formData[`lc_num_${i}`] || 0,
					lc_item: formData[`lc_item_${i}`] || '',
					lc_price: formData[`lc_price_${i}`] || 0,
					lc_comment: formData[`lc_comment_${i}`] || ''
				});
			}
		}

		const requestData = {
			lc_category: formData.lc_category,
			lc_local: formData.lc_local,
			lc_type: formData.lc_type,
			lc_user: formData.lc_user,
			team: formData.team,
			usageDetails: usageDetails,
			submittedAt: new Date().toISOString()
		};

		try {
			const result = await this.sendToServer(requestData);
			const successCard = this.createSuccessCard(requestData, result.requestId);
			
			await context.sendActivity({
				attachments: [CardFactory.adaptiveCard(successCard)]
			});

		} catch (error) {
			console.error('서버 전송 오류:', error);
			await context.sendActivity('❌ 등록 중 오류가 발생했습니다.');
		}
	}

	async sendToServer(data) {
		const response = await axios.post(process.env.PHP_SERVER_URL, data, {
			headers: { 'Content-Type': 'application/json' },
			timeout: 10000
		});
		return response.data;
	}

	createSuccessCard(data, requestId) {
		const totalAmount = data.usageDetails.reduce((sum, item) => sum + Number(item.lc_price), 0);
		
		return {
			"type": "AdaptiveCard",
			"version": "1.4",
			"body": [
				{
					"type": "Container",
					"style": "good",
					"items": [{
						"type": "TextBlock",
						"text": "✅ 사용내역이 등록되었습니다!",
						"weight": "Bolder",
						"size": "Medium",
						"color": "Good"
					}]
				},
				{
					"type": "FactSet",
					"facts": [
						{ "title": "등록 ID", "value": requestId || 'N/A' },
						{ "title": "사용자", "value": data.lc_user },
						{ "title": "부서", "value": data.team || '-' },
						{ "title": "건수", "value": `${data.usageDetails.length}건` },
						{ "title": "총 금액", "value": `${totalAmount.toLocaleString()}원` }
					]
				}
			]
		};
	}
}

module.exports.CardUsageBot = CardUsageBot;