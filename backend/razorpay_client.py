import os
import pathlib
import razorpay
from dotenv import load_dotenv

# Try loading .env from backend directory first, then fallback to current working directory
backend_dir = pathlib.Path(__file__).parent
load_dotenv(backend_dir / ".env")
load_dotenv()

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")

_client = None

def get_razorpay_client():
    global _client
    if _client is None:
        if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
            raise ValueError("RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET must be set in .env")
        _client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
    return _client

def create_razorpay_order(amount_paise: int, merchant: str, tx_id: int = None) -> str:
    """
    Creates a Razorpay Test Mode Order for ALLOWED transactions.
    
    :param amount_paise: Amount in paise (integer)
    :param merchant: Merchant identifier string
    :param tx_id: Optional transaction record ID
    :return: Razorpay order ID string (e.g. 'order_TXURPxUpWNNMGo')
    """
    client = get_razorpay_client()
    order_data = {
        "amount": amount_paise,
        "currency": "INR",
        "notes": {
            "merchant": merchant,
            "system": "CircuitBreaker Policy Engine",
            "tx_id": str(tx_id) if tx_id else ""
        }
    }
    response = client.order.create(data=order_data)
    return response.get("id")
