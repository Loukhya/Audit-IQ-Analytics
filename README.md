# AuditIQ — AI-Powered Financial Audit Analytics Platform

[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18.2+-61DAFB.svg?logo=react&logoColor=black)](https://reactjs.org)
[![Vite](https://img.shields.io/badge/Vite-5.1+-646CFF.svg?logo=vite&logoColor=white)](https://vitejs.dev)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4+-38B2AC.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB.svg?logo=python&logoColor=white)](https://python.org)
[![Groq](https://img.shields.io/badge/Inference-Groq_Llama_3.3_70B-f55036.svg)](https://groq.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**AuditIQ** is an enterprise-grade forensic financial audit and anomaly detection platform designed for large-scale transaction datasets (e.g., the PaySim synthetic mobile-money benchmark with 6.3M+ records). Combining high-speed statistical algorithms, multi-factor risk scoring, behavioral and structuring detection, and Groq-accelerated LLM narrative generation, AuditIQ gives auditors a Deloitte GenW.AI-style forensic workbench to detect fraud, pinpoint compliance violations, and generate audit-ready documentation in minutes.

---

## Table of Contents

- [Key Features](#key-features)
- [Architecture Overview](#architecture-overview)
- [Tech Stack](#tech-stack)
- [Repository Structure](#repository-structure)
- [Analytical Modules](#analytical-modules)
- [Dataset Specification](#dataset-specification)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#1-backend-setup-fastapi)
  - [Frontend Setup](#2-frontend-setup-react--vite)
- [Environment Configuration](#environment-configuration)
- [API Reference](#api-reference)
- [Available Scripts](#available-scripts)
- [Typical Audit Workflow](#typical-audit-workflow)
- [Troubleshooting](#troubleshooting)
- [Security & Compliance](#security--compliance)
- [Contributing](#contributing)
- [License](#license)

---

## Key Features

- **Audit-Grade Forensic UI**: Dark-mode analytics interface inspired by Deloitte GenW.AI, featuring interactive charts, custom heatmaps, risk severity badges, and drill-down transaction tables.
- **Benford's Law Analysis**: First-digit and second-digit frequency distribution tests, Mean Absolute Deviation (MAD), Chi-Square ($\chi^2$) goodness-of-fit tests, and digit-level Z-score anomalies.
- **Temporal Anomaly & Burst Detection**: 7×24 day-hour fraud concentration heatmaps, late-night transaction windows (10 PM–5 AM), weekend uplift ratios, and high-velocity burst account detection (<2-hour transaction clusters).
- **Multi-Factor Risk Scoring Engine**: Weighted multi-dimensional heuristic model evaluating amount deviations, balance anomalies, temporal risk, round-number patterns, destination entity types, and account velocity into categorized bands (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`).
- **Duplicate & Structuring Detection**: Forensic pattern detection identifying:
  - **Exact Duplicates**: Identical amount, type, origin, and destination within a narrow time window.
  - **Near-Time Clones**: Repeated transfers separated by 4–24 hours.
  - **Amount Cloning**: Same source broadcasting identical amounts to multiple recipient accounts.
  - **Structuring / Smurfing**: Series of split sub-threshold transactions engineered to bypass regulatory reporting limits.
  - **Mirror Transactions**: Rapid fund round-trips ($A \rightarrow B \rightarrow A$) signaling layering schemes.
- **Natural Language Audit Assistant (NL Query)**: Hybrid query engine combining local pandas DataFrame filtering with Groq LLM inference over persistent audit context summaries.
- **AI-Powered Executive Audit Exception Report**: Automated generation of formal forensic reports adhering to Certified Fraud Examiner (CFE) reporting standards, complete with executive summaries, findings matrices, risk ratings, and export options (HTML & PDF).

---

## Architecture Overview

AuditIQ follows a decoupled, asynchronous client-server architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                 AuditIQ Frontend (Port 5173)                │
│    React 18  •  Vite  •  Tailwind CSS  •  Recharts  • Axios │
└──────────────────────────────┬──────────────────────────────┘
                               │ HTTP / JSON API (REST)
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                 AuditIQ Backend (Port 8000)                 │
│               FastAPI  •  Uvicorn  •  Pydantic              │
├──────────────────────────────┬──────────────────────────────┤
│      Analytical Engines      │       Data & Session         │
│  • Benford's Law (SciPy)     │  • In-Memory DataFrame       │
│  • Temporal & Burst Analysis │  • JSON Cache Manager        │
│  • Multi-Factor Risk Scorer  │  • Context Builder Engine    │
│  • Duplicate & Structuring   │                              │
├──────────────────────────────┴──────────────────────────────┤
│                      AI Inference Engine                    │
│             Groq Cloud API (Llama 3.3 70B Versatile)         │
└─────────────────────────────────────────────────────────────┘
```

### Request & Data Lifecycle
1. **Ingestion**: The auditor uploads a CSV dataset via `/upload/csv` or requests the backend to generate a synthetic PaySim sample via `/upload/generate-sample`.
2. **State Management**: The backend loads the data into `utils.state`, caching metadata and summary distributions to disk in `backend/cache/`.
3. **Execution**: The auditor triggers specialized analytical modules (`/benford`, `/temporal`, `/risk`, `/duplicates`). Each module calculates statistical metrics, identifies suspicious rows, and stores summary outputs in the local JSON cache.
4. **Context Synthesis**: When natural language questions or report generation are initiated, `utils.context_builder` synthesizes cached findings into a concise, token-efficient audit context.
5. **AI Reasoning**: The backend dispatches the aggregated context and user instructions to Groq (`llama-3.3-70b-versatile`) with strict system prompts for forensic verification.

---

## Tech Stack

| Layer | Technologies |
|---|---|
| **Frontend Framework** | React 18.2, Vite 5.1 |
| **Styling & UI** | Tailwind CSS 3.4, `@tailwindcss/typography`, Lucide React |
| **Data Visualization** | Recharts 2.12 (Area, Bar, Scatter, Composed, Custom Heatmaps) |
| **Client Routing & State**| React Router DOM 6.22, React Context API (`DataContext`) |
| **Document Export** | HTML2PDF.js, React Markdown |
| **Backend Framework** | FastAPI 0.110, Uvicorn (ASGI) |
| **Data Processing & ML**| Pandas 2.2, NumPy 1.26, SciPy 1.12, Scikit-Learn 1.4 |
| **AI / LLM Provider** | Groq SDK (`llama-3.3-70b-versatile`), Optional xAI / OpenAI |
| **Environment & Config** | `python-dotenv`, Pydantic v2 |

---

## Repository Structure

```
AuditIQ-AI-Audit-Analytics/
├── backend/
│   ├── cache/                  # Runtime cache for module summaries (.gitkeep tracked)
│   ├── routers/                # FastAPI Modular Route Handlers
│   │   ├── __init__.py
│   │   ├── benford.py          # Benford's Law 1st & 2nd digit analysis
│   │   ├── duplicates.py       # Duplicate, clone, structuring & mirror detection
│   │   ├── nlquery.py          # AI Natural Language audit query engine
│   │   ├── report.py           # AI executive forensic audit report generator
│   │   ├── risk.py             # Multi-factor transaction risk scoring engine
│   │   ├── temporal.py         # Temporal anomaly, heatmap & burst detection
│   │   └── upload.py           # CSV validation, ingestion & synthetic generator
│   ├── utils/                  # Core Utilities & State Management
│   │   ├── __init__.py
│   │   ├── cache_manager.py    # Persistent JSON cache read/write/invalidation
│   │   ├── context_builder.py  # Aggregator for AI LLM audit context
│   │   └── state.py            # Active session dataset state holder
│   ├── .env.example            # Backend environment template
│   ├── main.py                 # FastAPI application entry point & middleware
│   └── requirements.txt        # Python package dependencies
├── frontend/
│   ├── src/
│   │   ├── api/
│   │   │   └── client.js       # Axios instance with configurable base URL
│   │   ├── components/         # Reusable UI Components
│   │   │   ├── ErrorBoundary.jsx
│   │   │   ├── LoadingSpinner.jsx
│   │   │   ├── PageWrapper.jsx
│   │   │   ├── Sidebar.jsx
│   │   │   ├── Toast.jsx
│   │   │   └── Topbar.jsx
│   │   ├── context/
│   │   │   └── DataContext.jsx # Global dataset context provider
│   │   ├── pages/              # Primary View Modules
│   │   │   ├── AuditReport.jsx
│   │   │   ├── BehavioralProfiling.jsx
│   │   │   ├── BenfordAnalysis.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── DataUpload.jsx
│   │   │   ├── DuplicateDetection.jsx
│   │   │   ├── NLQuery.jsx
│   │   │   ├── RiskScoring.jsx
│   │   │   └── TemporalAnalysis.jsx
│   │   ├── App.jsx             # Route definitions & layout wrappers
│   │   ├── index.css           # Custom scrollbars, animations & Tailwind styles
│   │   └── main.jsx            # React root mount
│   ├── .env.example            # Frontend environment template
│   ├── index.html              # HTML shell
│   ├── package.json            # Node.js dependencies & scripts
│   ├── package-lock.json       # Locked dependency tree
│   ├── postcss.config.js       # PostCSS plugins (Tailwind, Autoprefixer)
│   ├── tailwind.config.js      # Custom theme colors (auditiq-* palette)
│   └── vite.config.js          # Vite build & dev server config
├── .gitignore                  # Git ignore rules for Python, Node, data & secrets
├── requirements.txt            # Root requirements pointer
└── README.md                   # Comprehensive project documentation
```

---

## Analytical Modules

### 1. Benford's Law Analysis (`/benford`)
- **First-Digit & Second-Digit Tests**: Evaluates transaction amounts against logarithmic Benford distributions:
  $$P(d) = \log_{10}\left(1 + \frac{1}{d}\right), \quad d \in \{1, \dots, 9\}$$
- **Goodness-of-Fit**: Computes Chi-Square ($\chi^2$) statistic and degrees-of-freedom p-values.
- **Mean Absolute Deviation (MAD)**: Quantifies deviation severity into standard forensic conformity brackets (Close Conformity, Acceptable Conformity, Marginally Acceptable, Non-Conformity).
- **Z-Score Outlier Isolation**: Identifies digits exhibiting statistically significant over-representation.

### 2. Temporal Analysis & Burst Detection (`/temporal`)
- **Step-to-Time Transformation**: Translates PaySim synthetic simulation steps ($1 \text{ step} = 1 \text{ hour}$) into hour-of-day, day-of-week, and day-of-month indices.
- **Fraud Concentration Heatmap**: 7-day $\times$ 24-hour visual matrix highlighting high-intensity fraud windows.
- **Uplift Calculation**: Identifies risk ratios during off-hours:
  - Late-night window (10:00 PM – 05:00 AM)
  - Weekend surges (Saturday & Sunday)
  - End-of-month spike patterns
- **Burst Account Profiling**: Flags accounts initiating rapid multiple transactions within short rolling windows ($\le 2$ hours).

### 3. Multi-Factor Risk Scoring (`/risk`)
Combines 7 weighted dimensions (scale 0–100) to evaluate every transaction:
1. **Amount Deviation (25%)**: Z-score deviation relative to transaction-type mean.
2. **Transaction Type Risk (20%)**: Higher base risk for `TRANSFER` and `CASH_OUT`.
3. **Balance Inconsistency (15%)**: Zero balance depletion or post-transaction balance mismatches.
4. **Temporal Risk (15%)**: Transactions executed during off-hours or weekend windows.
5. **Round-Number Patterns (10%)**: Exact thousand/ten-thousand multiples commonly linked to arbitrary transfer thresholds.
6. **Destination Type Risk (10%)**: High-risk counterparty flows (e.g., C-to-C vs. C-to-M).
7. **Velocity Risk (5%)**: Frequency of origin entity appearances.

Transactions are scored and classified into severity tiers:
- **Low Risk (0–29)**: Standard operational transactions.
- **Medium Risk (30–59)**: Transactions requiring review during sample audits.
- **High Risk (60–79)**: Transactions flagged for substantive testing.
- **Critical Risk (80–100)**: Imminent fraud indicators requiring immediate investigation.

### 4. Duplicate & Structuring Detection (`/duplicates`)
- **Exact Duplicates**: Exact matches on source, destination, transaction type, and amount within 3 simulation steps.
- **Near-Time Clones**: Equivalent amounts transferred between identical parties within 4–24 hours.
- **Amount Cloning**: High-volume fan-out where one origin transfers identical amounts to multiple recipients in rapid succession.
- **Structuring (Smurfing)**: Multiple sub-threshold transfers (e.g., just under \$10,000 regulatory triggers) aggregating to large sums.
- **Mirror Transactions**: Bidirectional flow ($A \rightarrow B$ followed quickly by $B \rightarrow A$) characteristic of layering and money laundering.

### 5. AI Natural Language Query Assistant (`/nlquery`)
- **Direct Data Filtering**: Resolves explicit quantitative questions (e.g., *"Show transfers above $500,000 on weekends"*) directly in pandas.
- **LLM Reasoning**: Formulates executive explanations for abstract questions (e.g., *"Why is account C12345 flagged as critical?"*) using Groq Cloud API.

### 6. AI Executive Audit Report Generator (`/report`)
- **Automated CFE Synthesis**: Ingests all active module findings and synthesizes a formal Markdown report covering:
  1. Executive Summary & Audit Scope
  2. Dataset Overview & Data Integrity Assessment
  3. Statistical Anomaly Findings (Benford's Law)
  4. Temporal Pattern & Operational Outliers
  5. High-Risk Transaction & Counterparty Breakdown
  6. Duplicate & Structuring Forensic Indicators
  7. Auditor Recommendations & Internal Control Enhancements
- **Export Capabilities**: Clean printable styling with instant browser print / PDF export support.

---

## Dataset Specification

AuditIQ is pre-configured for the **PaySim** financial fraud detection dataset, simulating mobile financial transactions:

| Field Name | Type | Description |
|---|---|---|
| `step` | Integer | Simulation time step ($1 \text{ step} = 1 \text{ hour}$, total 744 steps / 30 days) |
| `type` | String | Transaction type: `CASH-IN`, `CASH-OUT`, `DEBIT`, `PAYMENT`, `TRANSFER` |
| `amount` | Float | Amount of the transaction in local currency |
| `nameOrig` | String | Unique identifier of the initiating customer account |
| `oldbalanceOrg` | Float | Origin account balance prior to transaction |
| `newbalanceOrig` | Float | Origin account balance following transaction |
| `nameDest` | String | Unique identifier of recipient account (Merchant `M*` or Customer `C*`) |
| `oldbalanceDest` | Float | Recipient balance prior to transaction |
| `newbalanceDest` | Float | Recipient balance following transaction |
| `isFraud` | Integer | Ground truth fraud marker ($1 = \text{fraud}, 0 = \text{legitimate}$) |
| `isFlaggedFraud`| Integer | Threshold-based control flag ($1 = \text{flagged}, 0 = \text{unflagged}$) |

> **No dataset? No problem!** AuditIQ includes a built-in synthetic generator that generates a realistic 500-row PaySim-compliant CSV with embedded fraud patterns directly from the **Data Upload** screen.

---

## Getting Started

### Prerequisites

Ensure you have the following installed on your system:
- **Python**: `3.10` or higher ([python.org](https://www.python.org/downloads/))
- **Node.js**: `18.0` or higher ([nodejs.org](https://nodejs.org/))
- **npm**: `9.0` or higher (bundled with Node.js)
- **Groq API Key**: Obtain a free API key at [console.groq.com](https://console.groq.com/keys) for AI narrative features.

---

### 1. Backend Setup (FastAPI)

1. Open a terminal and navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create and activate a Python virtual environment:
   - **Windows (Command Prompt / PowerShell):**
     ```powershell
     python -m venv venv
     .\venv\Scripts\activate
     ```
   - **macOS / Linux:**
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```

3. Install required Python dependencies:
   ```bash
   pip install --upgrade pip
   pip install -r requirements.txt
   ```

4. Configure your environment variables:
   ```bash
   # Copy the example environment file
   cp .env.example .env
   ```
   Open `backend/.env` in your editor and enter your Groq API key:
   ```env
   GROQ_API_KEY=gsk_yourActualGroqApiKeyHere
   ```

5. Launch the FastAPI server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   The API server will start at `http://localhost:8000`. You can verify API health and explore the Swagger interactive documentation at:
   - Health check: [http://localhost:8000/health](http://localhost:8000/health)
   - Interactive OpenAPI docs: [http://localhost:8000/docs](http://localhost:8000/docs)

---

### 2. Frontend Setup (React + Vite)

1. Open a second terminal window and navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install Node dependencies:
   ```bash
   npm install
   ```

3. Configure frontend environment variables (optional, defaults to `http://localhost:8000`):
   ```bash
   cp .env.example .env
   ```

4. Start the Vite development server:
   ```bash
   npm run dev
   ```

5. Open your browser and navigate to:
   ```
   http://localhost:5173
   ```

---

## Environment Configuration

### Backend Variables (`backend/.env`)

| Variable | Description | Required | Default |
|---|---|---|---|
| `GROQ_API_KEY` | Groq Cloud API key for Llama 3.3 70B inference | **Yes** (for AI features) | None |
| `XAI_API_KEY` | xAI (Grok) API key | No | None |
| `OPENAI_API_KEY`| OpenAI API key fallback | No | None |
| `HOST` | Server bind host address | No | `0.0.0.0` |
| `PORT` | Server listen port | No | `8000` |

### Frontend Variables (`frontend/.env`)

| Variable | Description | Required | Default |
|---|---|---|---|
| `VITE_API_BASE_URL` | Base URL for FastAPI backend endpoints | No | `http://localhost:8000` |

---

## API Reference

The backend exposes RESTful JSON endpoints grouped into functional routers:

| Router | Method | Endpoint | Description |
|---|---|---|---|
| **System** | `GET` | `/` | API status and root banner |
| **System** | `GET` | `/health` | Service health, cache states & session stats |
| **Upload** | `POST` | `/upload/csv` | Ingests and validates a PaySim CSV file |
| **Upload** | `GET` | `/upload/generate-sample` | Generates a 500-row synthetic PaySim CSV stream |
| **Upload** | `GET` | `/upload/stats` | Returns current dataset row counts and distributions |
| **Benford** | `POST` | `/benford/analyze` | Executes 1st and 2nd digit Benford's Law analysis |
| **Benford** | `GET` | `/benford/export-deviations` | Downloads CSV of transactions with suspicious digits |
| **Temporal** | `POST` | `/temporal/analyze` | Computes 7×24 heatmap, peak windows & burst accounts |
| **Temporal** | `GET` | `/temporal/export-flagged` | Exports CSV of temporal anomaly transactions |
| **Risk** | `POST` | `/risk/score` | Calculates multi-factor risk scores (0–100) for dataset |
| **Risk** | `GET` | `/risk/export-critical` | Exports CSV of transactions categorized as CRITICAL |
| **Duplicates**| `POST` | `/duplicates/analyze` | Detects clones, duplicates, structuring & mirrors |
| **Duplicates**| `GET` | `/duplicates/export` | Downloads CSV of flagged duplicate/structuring groups |
| **NL Query** | `POST` | `/nlquery/ask` | Natural language query assistant over dataset context |
| **Report** | `GET` | `/report/generate` | Generates comprehensive AI Markdown audit report |

---

## Available Scripts

### Root Directory
| Command | Description |
|---|---|
| `pip install -r requirements.txt` | Installs all backend Python dependencies |

### Backend (`/backend`)
| Command | Description |
|---|---|
| `uvicorn main:app --reload --port 8000` | Starts development server with hot-reload |
| `uvicorn main:app --host 0.0.0.0 --port 8000` | Starts server bound to all network interfaces |

### Frontend (`/frontend`)
| Command | Description |
|---|---|
| `npm run dev` | Starts Vite local development server on port 5173 |
| `npm run build` | Compiles optimized production bundle in `dist/` |
| `npm run preview` | Previews the production build locally |
| `npm run lint` | Runs ESLint syntax check across all JSX files |

---

## Typical Audit Workflow

1. **Start Services**: Launch backend (`uvicorn main:app --reload`) and frontend (`npm run dev`).
2. **Access Platform**: Navigate to `http://localhost:5173`.
3. **Load Data (`/upload`)**:
   - Drag and drop your PaySim CSV file, or click **Generate 500-Row Sample** to immediately populate the workspace.
   - Inspect dataset validation status, class balance, and column preview.
4. **Review Dashboard (`/`)**:
   - Inspect aggregate KPIs (Total Volume, Confirmed Fraud, High-Risk Volume).
   - Review global distribution across cash movements.
5. **Execute Deep Analytics**:
   - **Benford Analysis (`/benford`)**: Run first and second digit tests to inspect synthetic or human intervention in numbers.
   - **Temporal Analysis (`/temporal`)**: Analyze late-night activity, weekend ratios, and burst accounts.
   - **Risk Scoring (`/risk`)**: Score transactions and inspect the distribution of `CRITICAL` flags.
   - **Duplicate Detection (`/duplicates`)**: Uncover structuring rings, mirror transactions, and exact duplicates.
6. **Query Dataset (`/nlquery`)**:
   - Ask forensic questions in plain English: *"Which accounts participated in structuring?"* or *"List critical transfers over $1,000,000"*.
7. **Publish Audit Report (`/report`)**:
   - Select desired report modules, enter auditor and firm credentials, and click **Generate Report**.
   - Review findings, copy Markdown to clipboard, or export print-ready PDF/HTML.

---

## Troubleshooting

### 1. Port Conflicts (Address already in use)
- **Backend (Port 8000 in use):**
  ```bash
  # Run on a different port:
  uvicorn main:app --reload --port 8001
  ```
  *(Remember to update `VITE_API_BASE_URL=http://localhost:8001` in `frontend/.env`)*
- **Frontend (Port 5173 in use):**
  Vite will automatically pick the next available port (e.g., 5174).

### 2. AI Features Returning "Engine not configured"
- Check that `GROQ_API_KEY` is present in `backend/.env`.
- Ensure you restarted Uvicorn after saving `.env`.
- Confirm your API key has active quota on [console.groq.com](https://console.groq.com).

### 3. "No dataset loaded" Warnings in Analytical Pages
- Navigate to the **Data Upload** page (`/upload`) first and upload a CSV or generate the synthetic sample.
- Dataset state is held in-memory during the active session. If you restart Uvicorn, reload the dataset via the upload page.

---

## Security & Compliance

- **Zero Secret Leakage**: API keys (`GROQ_API_KEY`, `OPENAI_API_KEY`) reside exclusively on the FastAPI backend and are never transmitted to client browsers.
- **Data Privacy**: Transactions processed by local algorithms (Benford, Temporal, Risk, Duplicates) remain on your local machine. Only aggregated statistical summaries are sent to Groq for narrative synthesis.
- **Input Validation**: All CSV uploads are strictly validated against the PaySim schema to prevent CSV injection or malformed payloads.

---

## Contributing

Contributions, bug reports, and enhancements are welcome!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/ForensicEnhancement`)
3. Commit your Changes (`git commit -m 'Add specialized Benford conformity tests'`)
4. Push to the Branch (`git push origin feature/ForensicEnhancement`)
5. Open a Pull Request

---

## License

Distributed under the MIT License. See `LICENSE` for more information.
