import os
import json
import re
import pathlib
import httpx
from typing import Optional
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load env variables
backend_dir = pathlib.Path(__file__).parent
load_dotenv(backend_dir / ".env")
load_dotenv()

class TransactionIntent(BaseModel):
    amount: Optional[float] = Field(None, description="Transaction amount in INR rupees (e.g. 1500)")
    currency: str = Field("INR", description="Currency code (expected: INR)")
    category: Optional[str] = Field(None, description="Classified purchase category (e.g. groceries, electronics, gambling)")
    merchant: Optional[str] = Field(None, description="Merchant name if explicitly stated, otherwise null")
    reason: Optional[str] = Field(None, description="Concise reason for purchase")

class AIIntentError(Exception):
    """Exception raised when AI intent extraction fails or is incomplete."""
    pass

SYSTEM_PROMPT = """You are an AI Transaction Intent Extractor for a financial policy gate.
Your ONLY job is to convert natural-language payment requests into structured transaction intents.

CRITICAL INSTRUCTIONS:
1. Extract the payment amount in Indian Rupees (INR). Return it as a numeric value (e.g. ₹1,500 -> 1500, 800 rupees -> 800).
2. NEVER guess, invent, or assume an amount if the user did not explicitly provide one. If amount is missing or ambiguous, set "amount": null.
3. Set currency to "INR".
4. Classify the purchase into a simple lowercase category string (e.g., "groceries", "subscriptions", "electronics", "gambling", "travel").
5. Extract merchant name ONLY if explicitly stated in the message. Otherwise, set "merchant": null.
6. Provide a concise, clear reason describing the transaction intent.
7. NEVER make authorization decisions or check whether the payment is safe/permitted.
8. Output JSON ONLY matching this exact structure:
{
  "amount": number or null,
  "currency": "INR",
  "category": string or null,
  "merchant": string or null,
  "reason": string or null
}
Do not include any text outside the raw JSON object.
"""

def parse_intent_from_text(raw_text: str) -> TransactionIntent:
    """Helper to parse raw JSON output from LLM into TransactionIntent model."""
    clean_text = raw_text.strip()
    if clean_text.startswith("```"):
        clean_text = re.sub(r"^```(?:json)?\s*", "", clean_text)
        clean_text = re.sub(r"\s*```$", "", clean_text)

    try:
        data = json.loads(clean_text)
        return TransactionIntent(**data)
    except Exception as e:
        raise AIIntentError(f"Failed to parse AI output as JSON: {str(e)}")

def extract_intent_fallback(message: str) -> TransactionIntent:
    """
    Deterministic rule-based intent parser used for demo/test mode when AI_API_KEY is not set.
    Fails safely if amount cannot be explicitly found in text.
    """
    msg_lower = message.lower()

    # Extract amount: e.g. ₹800, 800 rupees, 800 rs, for 800, around 1500 rupees
    amt_match = re.search(r'(?:₹|rs\.?|rupees?)\s*([\d,]+)|([\d,]+)\s*(?:rupees?|rs\.?|₹)', msg_lower)
    if not amt_match:
        amt_match = re.search(r'\bfor\s+([\d,]+)\b', msg_lower)

    amount = None
    if amt_match:
        val_str = (amt_match.group(1) or amt_match.group(2)).replace(',', '')
        try:
            amount = float(val_str)
        except ValueError:
            amount = None

    if amount is None or amount <= 0:
        raise AIIntentError("Unable to understand transaction intent. Amount missing or ambiguous. No payment was attempted.")

    # Category classification
    category = "general"
    known_categories = ["groceries", "subscriptions", "electronics", "gambling", "crypto", "travel", "gaming", "luxury", "headphones"]
    for c in known_categories:
        if c in msg_lower:
            category = "electronics" if c == "headphones" else c
            break

    # Merchant extraction
    merchant = None
    merchant_match = re.search(r'from\s+([a-zA-Z0-9\s]+?)(?=\s+for|\s+$)', message, re.IGNORECASE)
    if merchant_match:
        merchant = merchant_match.group(1).strip()

    reason = f"Purchase {category}"

    return TransactionIntent(
        amount=amount,
        currency="INR",
        category=category,
        merchant=merchant,
        reason=reason
    )

async def parse_intent(message: str) -> TransactionIntent:
    """
    Sends natural language request to AI LLM provider and returns validated TransactionIntent.
    Fails safely if AI is unavailable, unconfigured, or output is invalid/incomplete.
    """
    if not message or not message.strip():
        raise AIIntentError("Unable to understand transaction intent. Request message is empty.")

    api_key = os.getenv("AI_API_KEY", "").strip()
    model = os.getenv("AI_MODEL", "gemini-2.5-flash").strip()
    base_url = os.getenv("AI_BASE_URL", "").strip()

    # If no API key set, use local intent extractor (demo fallback)
    if not api_key:
        return extract_intent_fallback(message)

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            if "gemini" in model.lower() or "generativelanguage.googleapis.com" in base_url:
                # Google Gemini REST API call
                url = base_url or f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                payload = {
                    "contents": [
                        {
                            "role": "user",
                            "parts": [
                                {"text": f"{SYSTEM_PROMPT}\n\nUser request: \"{message}\""}
                            ]
                        }
                    ],
                    "generationConfig": {
                        "temperature": 0.0,
                        "responseMimeType": "application/json"
                    }
                }
                resp = await client.post(url, json=payload)
                resp.raise_for_status()
                res_data = resp.json()
                text_content = res_data["candidates"][0]["content"]["parts"][0]["text"]
                return parse_intent_from_text(text_content)

            else:
                # OpenAI-compatible API call
                url = base_url or "https://api.openai.com/v1/chat/completions"
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json"
                }
                payload = {
                    "model": model,
                    "temperature": 0.0,
                    "messages": [
                        {"role": "system", "content": SYSTEM_PROMPT},
                        {"role": "user", "content": message}
                    ],
                    "response_format": {"type": "json_object"}
                }
                resp = await client.post(url, headers=headers, json=payload)
                resp.raise_for_status()
                res_data = resp.json()
                text_content = res_data["choices"][0]["message"]["content"]
                return parse_intent_from_text(text_content)

    except httpx.HTTPError as e:
        raise AIIntentError(f"AI API request failed: {str(e)}")
    except KeyError as e:
        raise AIIntentError(f"Unexpected response structure from AI provider: missing {str(e)}")
    except Exception as e:
        if isinstance(e, AIIntentError):
            raise e
        raise AIIntentError(f"Unable to understand transaction intent: {str(e)}")
