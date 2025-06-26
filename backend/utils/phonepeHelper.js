const { createHash } = require('crypto');

function generateOrderId() {
    const timestamp = Date.now();
    const randomNumber = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `ord-${timestamp}${randomNumber}`;
}

async function generateChecksum(payload, endpoint, saltKey) {
    const stringToHash = payload + endpoint + saltKey;
    const sha256Value = createHash('sha256').update(stringToHash).digest('hex');
    return `${sha256Value}###1`;
}

// New function matching PhonePe reference guide
function generateXVerify(payloadBase64, endpoint, saltKey) {
    const stringToHash = payloadBase64 + endpoint + saltKey;
    return createHash("sha256").update(stringToHash).digest("hex") + "###1";
}

module.exports = { generateOrderId, generateChecksum, generateXVerify }; 