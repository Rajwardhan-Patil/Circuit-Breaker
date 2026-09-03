from dotenv import load_dotenv
import os, razorpay
load_dotenv()
client = razorpay.Client(auth=(os.getenv("RAZORPAY_KEY_ID"), os.getenv("RAZORPAY_KEY_SECRET")))
print(client.order.create({"amount": 100, "currency": "INR"})["id"])