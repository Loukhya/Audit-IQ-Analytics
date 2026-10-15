from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import os
import json
from utils.cache_manager import load_cache
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

router = APIRouter()

class NLQueryRequest(BaseModel):
    question: str

@router.post("/ask")
def answer_query(req: NLQueryRequest):
    query_text = req.question
    
    # Load all context from cache (retrieves info from the analysis dashboards)
    raw_context = {
        "benford": load_cache("benford"),
        "temporal": load_cache("temporal"),
        "duplicates": load_cache("duplicates"),
        "risk_scoring": load_cache("risk_scoring")
    }
    
    # Filter context to avoid exceeding token limits if needed, but include all insights
    context_summary = {}
    for mod, data in raw_context.items():
        if isinstance(data, dict):
             context_summary[mod] = data.get("summary", data) # Fallback to full data if summary missing
        else:
             context_summary[mod] = None

    context_str = json.dumps(context_summary, indent=2)

    groq_key = os.getenv("GROQ_API_KEY")

    if not groq_key:
        # Fallback heuristic if no LLM functionality
        query_lower = query_text.lower()
        if "benford" in query_lower:
            return {"answer": f"Based on Benford's analysis:\n{json.dumps(context_summary.get('benford'), indent=2)}"}
        elif "risk" in query_lower:
            return {"answer": f"Based on Risk scoring:\n{json.dumps(context_summary.get('risk_scoring'), indent=2)}"}
        elif "fraud" in query_lower:
            return {"answer": "To detect fraud, we evaluated structural, analytical, and temporal risks. Please review the 'risk_scoring' metrics for high and critical flagged items."}
        else:
            return {"answer": "AI Engine not configured (missing GROQ_API_KEY). Available context:\n" + context_str}

    try:
        from groq import Groq
        client = Groq(api_key=groq_key)
        
        system_prompt = f"""You are AuditIQ, an advanced and highly Knowledgeable AI Financial Audit Assistant.
Your primary role is to provide detailed, accurate, and insightful answers to the user's queries based directly on the financial audit dataset anomalies, risk scores, and dashboard findings provided in the context below.

### Analytical Context & Dashboard Data:
{context_str}

### Instructions for Generating Responses:
1. **Analyze Context Deeply**: Thoroughly review the 'benford', 'temporal', 'duplicates', and 'risk_scoring' modules provided in the context.
2. **Be Insightful and Detailed**: Do not simply return raw JSON data. Translate the findings into clear, executive-friendly insights. If asked about duplicates, specifically break down Exact Duplicates, Near-Time Clones, Structuring Groups, and Mirror Transactions.
3. **Use Concrete Numbers**: Support your answers using the exact transaction counts, risk severity counts (Critical, High, Medium, Low), and percentages found in the risk scoring and duplicate sections.
4. **Professional Audit Tone**: Speak eloquently like a senior forensic auditor advising an executive.
5. **No Hallucinations**: If the queried information is not available in the analytical context provided, politely state that it is not available in the current dataset analysis.
"""
        response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query_text}
            ],
            temperature=0.2, # slight increase to allow more detailed explanations
            max_tokens=2048
        )
        answer = response.choices[0].message.content
        return {"answer": answer}
    except Exception as e:
        print(f"AI Error: {e}")
        return {"answer": f"Error interacting with AI Engine: {str(e)}"}
