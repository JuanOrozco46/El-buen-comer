const payload = {
  event: "messages.upsert",
  instance: "test_instance",
  data: {
    key: {
      remoteJid: "573102223344@s.whatsapp.net",
      fromMe: false,
      id: "ABC123456"
    },
    pushName: "Juan Prueba",
    message: {
      conversation: "Arroz con Pollo Personal"
    },
    messageType: "conversation",
    type: "notify"
  }
};

async function testWebhook() {
  try {
    const response = await fetch("http://localhost:3000/api/whatsapp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    console.log("Response from webhook:", result);
  } catch (error) {
    console.error("Error testing webhook:", error);
  }
}

testWebhook();
