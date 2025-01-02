import "regenerator-runtime/runtime"; // if needed for async/await in older browsers

// DOM Elements
const chatContainer = document.getElementById("chat-container");
const messageForm = document.getElementById("message-form");
const userInput = document.getElementById("user-input");
const apiSelector = document.getElementById("api-selector");
const newChatBtn = document.getElementById("new-chat-btn");
const surveyModal = document.getElementById("survey-modal");
const surveyQuestion = document.getElementById("survey-question");
const surveyOptions = document.getElementById("survey-options");
const surveySendBtn = document.getElementById("survey-send-btn");


// const BASE_URL = process.env.API_ENDPOINT;
const BASE_URL = "http://localhost:8000";

let db;
let choice = "";

async function initDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("myChatDB", 1);
    request.onupgradeneeded = function (e) {
      db = e.target.result;
      if (!db.objectStoreNames.contains("chats")) {
        db.createObjectStore("chats", { keyPath: "id", autoIncrement: true });
      }
      if (!db.objectStoreNames.contains("metadata")) {
        db.createObjectStore("metadata", { keyPath: "key" });
      }
    };
    request.onsuccess = function (e) {
      db = e.target.result;
      resolve();
    };
    request.onerror = function (e) {
      reject(e);
    };
  });
}

async function saveMessage(role, content) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("chats", "readwrite");
    const store = tx.objectStore("chats");
    store.add({ role, content });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

async function getAllMessages() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("chats", "readonly");
    const store = tx.objectStore("chats");
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = (e) => reject(e);
  });
}

async function saveMetadata(key, value) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("metadata", "readwrite");
    const store = tx.objectStore("metadata");
    store.put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

async function getMetadata(key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("metadata", "readonly");
    const store = tx.objectStore("metadata");
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ? req.result.value : null);
    req.onerror = (e) => reject(e);
  });
}

async function clearAllData() {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(["chats", "metadata"], "readwrite");
    tx.objectStore("chats").clear();
    tx.objectStore("metadata").clear();
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e);
  });
}

function createMessageBubble(content, sender = "user") {
  const wrapper = document.createElement("div");
  wrapper.classList.add("mb-6", "flex", "items-start", "space-x-3");

  const avatar = document.createElement("div");
  avatar.classList.add(
    "w-10",
    "h-10",
    "rounded-full",
    "flex-shrink-0",
    "flex",
    "items-center",
    "justify-center",
    "font-bold",
    "text-white"
  );

  if (sender === "assistant") {
    // wrapper.classList.add("flex-row");
    avatar.classList.add("bg-gradient-to-br", "from-green-400", "to-green-600");
    const img = document.createElement("img");
    img.src = "./static/moneycat3.png";
    img.alt = "Assistant Avatar";
    img.classList.add("w-8", "h-8", "rounded-full");
    avatar.appendChild(img);
    // avatar.textContent = "A";
  } else {
    avatar.classList.add("bg-gradient-to-br", "from-blue-500", "to-blue-700");
    avatar.textContent = "U";
  }

  const bubble = document.createElement("div");
  bubble.classList.add(
    "max-w-full",
    "md:max-w-2xl",
    "p-3",
    "rounded-lg",
    "whitespace-pre-wrap",
    "leading-relaxed",
    "shadow-sm"
  );

  if (sender === "assistant") {
    bubble.classList.add("bg-gray-200", "text-gray-900");
  } else {
    bubble.classList.add("bg-blue-600", "text-white");
  }

  bubble.textContent = content;

  wrapper.appendChild(avatar);
  wrapper.appendChild(bubble);
  return wrapper;
}

function scrollToBottom() {
  chatContainer.scrollTop = chatContainer.scrollHeight;
}

async function getAssistantResponse(userMessage) {
  // return new Promise((resolve) => {
  //   setTimeout(() => {
  //     resolve("가짜 GPT 응답: " + userMessage);
  //   }, 1500)
  // });
  const mode = apiSelector.value;
  let url;
  let payload;

  if (mode === "assistant") {
    const thread_id = await getMetadata("thread_id");
    payload = { message: userMessage };
    if (thread_id) {
      payload.thread_id = thread_id;
    }
    url = `${BASE_URL}/assistant`;
  } else {
    // Naive mode
    const allMsgs = await getAllMessages();
    console.log('들어옴')
    console.log('allMsgs:',allMsgs)
    const messagesForAPI = [
      { role: "system", content: "You are a helpful assistant." },
      ...allMsgs.map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: userMessage },
    ];
    console.log("확인용", choice)
    payload = { question: userMessage, choice: choice };
    url = `${BASE_URL}/chat`;
    choice = "";
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("Network response was not ok");
  }

  const data = await response.json();

  if (mode === "assistant" && data.thread_id) {
    const existingThreadId = await getMetadata("thread_id");
    if (!existingThreadId) {
      await saveMetadata("thread_id", data.thread_id);
    }
  }

  return data.reply;
}

messageForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = userInput.value.trim();
  if (!message) return;

  chatContainer.appendChild(createMessageBubble(message, "user"));
  await saveMessage("user", message);

  userInput.value = "";
  scrollToBottom();

  try {
    const response = await getAssistantResponse(message);
    chatContainer.appendChild(createMessageBubble(response, "assistant"));
    await saveMessage("assistant", response);
    scrollToBottom();
  } catch (error) {
    console.error("Error fetching assistant response:", error);
    const errMsg = "Error fetching response. Check console.";
    chatContainer.appendChild(createMessageBubble(errMsg, "assistant"));
    await saveMessage("assistant", errMsg);
    scrollToBottom();
  }
});

async function loadExistingMessages() {
  const allMsgs = await getAllMessages();
  for (const msg of allMsgs) {
    chatContainer.appendChild(createMessageBubble(msg.content, msg.role));
  }
  scrollToBottom();
}

newChatBtn.addEventListener("click", async () => {
  // Clear DB data and UI
  await clearAllData();
  chatContainer.innerHTML = "";
  // Now user can start a new chat fresh
});

initDB()//.then(loadExistingMessages);

console.log(BASE_URL);


// Survey Questions
const surveyData = [
  {
    desc: "사용자님의 투자성향을 파악하기 위해 7가지의 질문에 답변해주세요.",
    question: "질문 1번: 당신의 연령대는 어떻게 됩니까?",
    options: [
      { text: "19세 이하", value: 12.5 },
      { text: "20세 ~ 40세", value: 12.5 },
      { text: "41세 ~ 50세", value: 9.3 },
      { text: "50세 ~ 60세", value: 6.2 },
      { text: "61세 이상", value: 3.1 },
    ],
  },
  {
    desc: "사용자님의 투자성향을 파악하기 위해 7가지의 질문에 답변해주세요.",
    question: "질문 2번: 투자하고자 하는 자금의 투자 가능 기간은 얼마나 됩니까?",
    options: [
      { text: "6개월 이내", value: 3.1 },
      { text: "6개월 이상 ~ 1년 이내", value: 6.2 },
      { text: "1년 이상 ~ 2년 이내", value: 9.3 },
      { text: "2년 이상 ~ 3년 이내", value: 12.5 },
      { text: "3년 이상", value: 15.6 },
    ],
  },
  {
    desc: "사용자님의 투자성향을 파악하기 위해 7가지의 질문에 답변해주세요.",
    question: "질문 3번: 다음 중 투자경험과 가장 가까운 것은 어느 것입니까?(중복 가능)",
    options: [
      { text: "은행의 예적금, 국채, 지방채, 보증채, MMF, CMA 등", value: 3.1 },
      { text: "금융채, 신용도가 높은 회사채, 채권형 펀드, 원금보존추구형 ELS 등", value: 6.2 },
      { text: "신용도 중간 등급의 회사채, 원금의 일부만 보장되는 ELS, 혼합형펀드 등", value: 9.3 },
      { text: "신용도가 낮은 회사채, 주식, 원금이 보장되지 않는 ELS, 시장수익률 수준의 수익을 추구하는 주식형펀드 등", value: 12.5 },
      { text: "ELW, 선물옵션, 시장수익률 이상의 수익을 추구하는 주식형펀드, 파생상품에 투자하는 펀드, 주식 신용거래 등", value: 15.6 },
    ],
  },
  {
    desc: "사용자님의 투자성향을 파악하기 위해 7가지의 질문에 답변해주세요.",
    question: "질문 4번: 금융상품 투자에 대한 본인의 지식수준은 어느 정도라고 생각하십니까?",
    options: [
      { text: "[매우 낮은 수준] 투자의사 결정을 스스로 내려본 경험이 없는 정도", value: 3.1 },
      { text: "[낮은 수준] 주식과 채권의 차이를 구별할 수 있는 정도", value: 6.2 },
      { text: "[높은 수준] 투자할 수 있는 대부분의 금융상품의 차이를 구별할 수 있는 정도", value: 9.3 },
      { text: "[매우 높은 수준] 금융상품을 비롯하여 모든 투자대상 상품의 차이를 이해할 수 있는 정도", value: 12.5 },
    ],
  },
  {
    desc: "사용자님의 투자성향을 파악하기 위해 7가지의 질문에 답변해주세요.",
    question: "질문 5번: 현재 투자하고자 하는 자금은 전체 금융자산(부동산 등을 제외) 중 어느 정도의 비중을 차지합니까?",
    options: [
      { text: "10% 이내", value: 1 },
      { text: "10% 이상 ~ 20% 이내", value: 2 },
      { text: "20% 이상 ~ 30% 이내", value: 3 },
      { text: "30% 이상 ~ 40% 이내", value: 4 },
      { text: "40%", value: 5 },
    ],
  },
  {
    desc: "사용자님의 투자성향을 파악하기 위해 7가지의 질문에 답변해주세요.",
    question: "질문 6번: 다음 중 당신의 수입원을 가장 잘 나타내고 있는 것은 어느 것입니까?",
    options: [
      { text: "현재 일정한 수입이 발생하고 있으며, 향후 현재 수준을 유지하거나 증가할 것으로 예상된다.", value: 9.3 },
      { text: "현재 일정한 수입이 발생하고 있으나, 향후 감소하거나 불안정할 것으로 예상된다.", value: 6.2 },
      { text: "현재 일정한 수입이 없으며, 연금이 주수입원이다.", value: 3.1 },
    ],
  },
  {
    desc: "사용자님의 투자성향을 파악하기 위해 7가지의 질문에 답변해주세요.",
    question: "질문 7번: 만약 투자원금에 손실이 발생할 경우 다음 중 감수할 수 있는 손실 수준은 어느 것입니까?",
    options: [
      { text: "무슨 일이 있어도 투자원금은 보전되어야 한다.", value: 6.2 },
      { text: "10% 미만까지는 손실을 감수할 수 있을 것 같다.", value: 6.2 },
      { text: "20% 미만까지는 손실을 감수할 수 있을 것 같다.", value: 12.5 },
      { text: "기대수익이 높다면 위험이 높아도 상관하지 않겠다.", value: 18.7 },
    ],
  },
];
let currentQuestionIndex = 0;
let totalScore = 0;
const selectedOptions = new Set();

// Functions
function showQuestion() {
  const currentData = surveyData[currentQuestionIndex]; // 현재 데이터 가져오기

  // desc와 question을 각각 표시
  surveyQuestion.innerHTML = `
    <p class="mb-2 text-gray-600">${currentData.desc}</p>
    <p class="font-semibold">${currentData.question}</p>
  `;

  surveyOptions.innerHTML = ""; // 기존 옵션 초기화

  const isMultipleChoice = currentQuestionIndex === 2; // 3번 질문: 중복 선택 허용 여부
  const selectedOptions = new Set(); // 선택된 항목 관리

  let nextButton; // Next 버튼을 함수 스코프 내에서 선언

  currentData.options.forEach((option, index) => {
    const button = document.createElement("button");
    button.textContent = option.text;
    button.className = "px-4 py-2 border border-gray-300 rounded-md hover:bg-gray-100 w-full text-left";

    if (isMultipleChoice) {
      // 중복 선택 허용
      button.addEventListener("click", () => {
        if (selectedOptions.has(index)) {
          selectedOptions.delete(index); // 선택 제거
          button.classList.remove("bg-gray-200"); // 강조 제거
        } else {
          selectedOptions.add(index); // 선택 추가
          button.classList.add("bg-gray-200"); // 강조 표시
        }
        // Next 버튼 활성화 여부 확인
        if (nextButton) {
          nextButton.disabled = selectedOptions.size === 0; // 최소 1개 선택 시 활성화
        }
      });
    } else {
      // 단일 선택 처리
      button.addEventListener("click", () => {
        totalScore += option.value;
        if (currentQuestionIndex < surveyData.length - 1) {
          currentQuestionIndex++;
          showQuestion(); // 다음 질문으로 이동
        } else {
          surveySendBtn.disabled = false; // 마지막 질문에서 버튼 활성화
        }
      });
    }
    surveyOptions.appendChild(button); // 옵션 추가
  });

  // 3번 질문: Next 버튼 제공
  if (isMultipleChoice) {
    nextButton = document.createElement("button"); // Next 버튼 선언
    nextButton.textContent = "다음";
    nextButton.className = "bg-black text-white px-4 py-2 rounded-md hover:bg-black transition mt-4 disabled:opacity-50 disabled:cursor-not-allowed";
    nextButton.disabled = true; // 초기 비활성화

    nextButton.addEventListener("click", () => {
      // 선택된 항목의 점수 합산
      selectedOptions.forEach((index) => {
        totalScore += currentData.options[index].value;
      });
      selectedOptions.clear(); // 선택 초기화
      currentQuestionIndex++;
      showQuestion(); // 다음 질문
    });

    surveyOptions.appendChild(nextButton); // Next 버튼 추가
  }
}

async function sendInvestmentTypeToBackend(investmentType) {
  const payload = {
    investmentType
  };

  try {
    const response = await fetch(`${BASE_URL}/investment-type`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error("Failed to send investment type to backend.");
    }

    const data = await response.json();
    console.log("Response from backend:", data);
    // await saveMessage('assistant', data.reply);
    console.log("save Message");

    try {
      chatContainer.appendChild(createMessageBubble(data.reply, "assistant"));
      // await saveMessage("assistant", response);
      await saveMessage('assistant', data.reply);
      scrollToBottom();
    } catch (error) {
      console.error("Error fetching assistant response:", error);
      const errMsg = "Error fetching response. Check console.";
      chatContainer.appendChild(createMessageBubble(errMsg, "assistant"));
      await saveMessage("assistant", errMsg);
      scrollToBottom();
    }
      
      setTimeout(() => {
        const additionalQuestion = "원하시는 투자상품이 있나요?";
        chatContainer.appendChild(createMessageBubble(additionalQuestion, "assistant"));
        saveMessage("assistant", additionalQuestion);
        const optionsContainer = document.createElement("div");
        optionsContainer.classList.add("options-container");

        // 투자상품 옵션들
        const options = ["예금", "적금", "펀드", "채권", "ETF", "직접 입력"];

        // 각 옵션에 대해 버튼을 생성
        options.forEach(option => {
          const optionButton = document.createElement("button");
          optionButton.classList.add("option-button");
          optionButton.innerText = option;
          if (option === "직접 입력") {
            // "직접 입력" 버튼에 이벤트 추가
            optionButton.addEventListener("click", handleDirectInput);
          } else {
            // 나머지 옵션 버튼
            optionButton.addEventListener("click", () => handleOptionClick(option));
          }
      
          optionsContainer.appendChild(optionButton);
        });
        
        // optionsContainer를 채팅창에 추가
        chatContainer.appendChild(optionsContainer);
        scrollToBottom();
  
        // 추가 질문에 대한 응답을 처리하는 로직 추가 가능
      }, 2000); // 2초 후에 추가 질문 던지기

      function handleOptionClick(option) {
        // 사용자가 선택한 옵션에 대해 처리하는 로직
        console.log("사용자가 선택한 옵션:", option);
        choice = option;
        // sendChoiceToBackend(choice)
        const responseMessage = `${option}에 대해 더 궁금한 점이 있나요?`;
        chatContainer.appendChild(createMessageBubble(responseMessage, "assistant"));
        saveMessage("assistant", responseMessage);
      
        const inputContainer = document.querySelector(".input-container");
        if (inputContainer) {
          inputContainer.remove();
        }
        // 선택지 버튼들을 없앰
        const optionsContainer = document.querySelector(".options-container");
        if (optionsContainer) {
          optionsContainer.remove();
        }
      
        scrollToBottom();
      }
      // "직접 입력" 클릭 처리 함수
      function handleDirectInput() {
        // 입력창 생성
        const existingInputContainer = document.querySelector(".input-container");
        if (existingInputContainer) {
          return;  // 이미 입력창이 있으면 새로 생성하지 않음
        }
        const inputContainer = document.createElement("div");
        inputContainer.classList.add("input-container");

        const inputField = document.createElement("input");
        inputField.type = "text";
        inputField.placeholder = "투자상품을 입력해주세요.";
        inputField.classList.add("input-field");

        const submitButton = document.createElement("button");
        submitButton.innerText = "제출";
        submitButton.classList.add("submit-button");

        // 제출 버튼 클릭 이벤트
        submitButton.addEventListener("click", () => {
          const userInput = inputField.value.trim();
          if (userInput) {
            console.log("사용자가 입력한 값:", userInput);
            choice = userInput;
            // sendChoiceToBackend(choice)
            const responseMessage = `${userInput}에 대해 더 궁금한 점이 있나요?`;
            chatContainer.appendChild(createMessageBubble(responseMessage, "assistant"));
            saveMessage("assistant", responseMessage);

            // 입력창 제거
            inputContainer.remove();
            const optionsContainer = document.querySelector(".options-container");
            if (optionsContainer) {
              optionsContainer.remove();
            }

            scrollToBottom();
          }
        });

        inputContainer.appendChild(inputField);
        inputContainer.appendChild(submitButton);
        chatContainer.appendChild(inputContainer);

        scrollToBottom();
      }
  
    
  } catch (error) {
    console.error("Error sending investment type:", error);
  }
}

// async function sendChoiceToBackend(choice) {
//   const payload = { choice };

//   try {
//     const response = await fetch(`${BASE_URL}/send-choice`, {
//       method: "POST",
//       headers: {
//         "Content-Type": "application/json",
//       },
//       body: JSON.stringify(payload),
//     });

//     if (!response.ok) {
//       throw new Error("Failed to send choice to backend.");
//     }

//     const data = await response.json();
//     console.log("Choice:Response from backend:", data);
//   } catch (error) {
//     console.error("Choice:Error sending choice to backend:", error);
//   }
// }

// newChatBtn.addEventListener("click", async () => {
//   // Clear DB data and UI
//   await clearAllData();
//   chatContainer.innerHTML = "";
//   // Now user can start a new chat fresh
// });

function openSurveyModal() {
  // chatContainer.innerHTML = "";
  surveyModal.classList.remove("hidden");
  currentQuestionIndex = 0;
  totalScore = 0;
  selectedOptions.clear();
  surveySendBtn.disabled = true;
  surveySendBtn.textContent = "완료";
  showQuestion();
}

function closeSurveyModal() {
    // 투자 성향 설정 로직
    let investmentType = "";
    if (totalScore <= 20) {
      investmentType = "안정형";
    } else if (totalScore > 20 && totalScore <= 40) {
      investmentType = "안정추구형";
    } else if (totalScore > 40 && totalScore <= 60) {
      investmentType = "위험중립형";
    } else if (totalScore > 60 && totalScore <= 80) {
      investmentType = "적극투자형";
    } else {
      investmentType = "공격투자형";
    }
  
    // 모달 닫기 및 결과 출력
    surveyModal.classList.add("hidden");
    // alert(`설문조사가 완료되었습니다!\n총 점수: ${totalScore}\n투자 성향: ${investmentType}`);
    sendInvestmentTypeToBackend(investmentType);
    // console.log(getAllMessages())
}


// Event Listener
surveySendBtn.addEventListener("click", () => {
  closeSurveyModal();
});

// Initialize the survey modal on page load
document.addEventListener("DOMContentLoaded", () => {
  // initDB().then(clearAllData());
  // console.log(getAllMessages());
  // chatContainer.innerHTML = "";
  // console.log('aa')
  openSurveyModal();
});
