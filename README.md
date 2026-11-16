# 📚 Collaborative Research Paper Explorer

> **A collaborative platform for discovering, organizing, managing, and exploring academic research papers with intelligent AI-powered assistance.**

Collaborative Research Paper Explorer is a full-stack web application designed to simplify academic research and improve collaboration among students, researchers, and academic communities.

The platform provides a centralized environment where users can manage research papers, organize collections, interact with other researchers, annotate papers, generate AI-assisted insights, and collaborate through shared research spaces.

---

## 📌 Table of Contents

- [Overview](#-overview)
- [Key Features](#-key-features)
- [User Roles](#-user-roles)
- [Technology Stack](#-technology-stack)
- [System Architecture](#-system-architecture)
- [Project Structure](#-project-structure)
- [Prerequisites](#-prerequisites)
- [Installation and Setup](#-installation-and-setup)
- [Environment Configuration](#-environment-configuration)
- [Running the Application](#-running-the-application)
- [API Overview](#-api-overview)
- [Security](#-security)
- [Database](#-database)
- [Testing](#-testing)
- [Git Workflow](#-git-workflow)
- [Troubleshooting](#-troubleshooting)
- [Future Enhancements](#-future-enhancements)
- [Contributing](#-contributing)
- [License](#-license)

---

## 🔍 Overview

Academic researchers often rely on multiple disconnected tools to discover papers, organize references, manage research materials, and communicate with collaborators.

Collaborative Research Paper Explorer aims to bring these activities together in one platform.

The application provides:

- Centralized research paper management.
- Researcher profiles and discovery.
- Collaborative paper annotations.
- AI-assisted paper understanding and organization.
- Social interaction and research communities.
- Secure user authentication and authorization.
- Administrative monitoring and management.

The system follows a modular full-stack architecture consisting of a React frontend, Node.js/Express backend, and PostgreSQL database.

---

## ✨ Key Features

### 1. 🔐 Authentication and Account Management

- Secure user registration and login.
- Email verification.
- Forgot-password and password-reset functionality.
- JWT-based authentication.
- Secure cookie handling.
- User logout and session invalidation.
- Automatic session expiration after inactivity.
- Institutional Single Sign-On (SSO).
- Account and profile management.

### 2. 👥 Role-Based Access Control

The platform supports three primary user roles:

| Role | Responsibilities |
|---|---|
| SYSTEM_ADMIN | Platform administration, monitoring, and system management. |
| RESEARCHER | Research paper management, collaboration, and researcher activities. |
| STUDENT | Research paper discovery, learning, and collaboration. |

Access to protected resources and operations is controlled through backend authorization mechanisms.

### 3. 📄 Research Paper Management

- Upload and manage research papers.
- Browse available research papers.
- Access paper metadata.
- Organize research materials.
- Maintain personal research collections.
- Retrieve paper information through backend APIs.

### 4. 📝 Collaborative Annotations

- Create annotations on research papers.
- Retrieve existing annotations.
- Update annotations.
- Delete annotations.
- Support collaborative research workflows.

### 5. 🤖 AI-Powered Research Assistance

- AI-assisted research paper understanding.
- Generate summaries of research papers.
- Suggest relevant tags based on uploaded paper content.
- Recommend existing tags.
- Suggest new tags when appropriate.
- Improve paper organization and discoverability.

### 6. 📑 Research Summary Export

- Generate summaries of research papers.
- Export generated summaries as PDF documents.
- Include paper title and author information.
- Include citations and source information in exported summaries.

### 7. 🌐 Researcher Discovery and Social Features

- Search for researcher profiles.
- View researcher information.
- Discover researchers and their published paper counts.
- Create and share posts.
- Support public and private account visibility.
- Allow public accounts to control individual post visibility.
- Enforce private-post visibility for private accounts.

### 8. 💬 Collaborative Messaging and Groups

- Create research groups.
- Join existing groups.
- Collaborate with group members.
- Support group-based communication.
- Facilitate academic discussions and knowledge sharing.

### 9. 🛡️ System Administrator Monitoring

The administrator monitoring functionality is designed to provide visibility into important system resources, including:

- Storage utilization and storage quotas.
- Redis queue monitoring.
- GenAI API token consumption.
- AI API usage and associated costs.
- Resource utilization and monitoring alerts.

Availability of individual monitoring integrations depends on the corresponding environment configuration.

---

## 👤 User Roles

### SYSTEM_ADMIN
Responsible for maintaining the platform and monitoring system-level resources.

### RESEARCHER
Can manage research activities, explore papers, organize collections, collaborate with other users, and use available research tools.

### STUDENT
Can discover research papers, explore academic resources, participate in collaborative activities, and interact with the research community.

**Important:** Role-based restrictions are enforced by the backend rather than relying exclusively on frontend visibility.

---

## 🛠️ Technology Stack

| Component | Technologies |
|---|---|
| Frontend | React.js |
| Build Tool | Vite |
| Routing | React Router |
| Styling | Tailwind CSS |
| Backend | Node.js |
| Backend Framework | Express.js |
| Database | PostgreSQL |
| Authentication | JWT |
| Password Security | bcryptjs |
| Email Services | Nodemailer |
| Authentication Integration | OAuth / OIDC |
| API Architecture | REST APIs |
| Testing | Node.js Test Runner, Supertest |
| Version Control | Git and GitHub |
| AI Integration | Configurable GenAI services |
| Queue Monitoring | Redis (optional) |

---

## 🏗️ System Architecture

The application follows a modular client-server architecture.

```text
              ┌─────────────────────────┐
              │       Users             │
              │                         │
              │ SYSTEM_ADMIN            │
              │ RESEARCHER               │
              │ STUDENT                  │
              └────────────┬────────────┘
                           │
                           ▼
              ┌─────────────────────────┐
              │     React Frontend      │
              │                         │
              │    Vite + React         │
              │    React Router         │
              │    Tailwind CSS         │
              └────────────┬────────────┘
                           │
                      REST APIs
                           │
                           ▼
              ┌─────────────────────────┐
              │    Node.js Backend      │
              │                         │
              │    Express.js           │
              │    Authentication       │
              │    Authorization        │
              │    Controllers          │
              │    Services             │
              │    Middleware           │
              └────────────┬────────────┘
                           │
              ┌────────────┼─────────────┐
              │            │             │
              ▼            ▼             ▼
        ┌──────────┐ ┌───────────┐ ┌───────────┐
        │PostgreSQL│ │ AI Services│ │   Redis   │
        │ Database │ │ (Optional) │ │ (Optional)│
        └──────────┘ └───────────┘ └───────────┘
```

### Architecture Highlights

- Separation of frontend and backend responsibilities.
- Modular backend structure.
- REST-based communication.
- Centralized database persistence.
- Middleware-based authentication and authorization.
- Configurable external service integrations.

---

## 📁 Project Structure

```text
Collaborative-Research-Paper-Explorer/
│
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── modules/
│   │   ├── repositories/
│   │   ├── routes/
│   │   ├── scripts/
│   │   ├── services/
│   │   ├── test/
│   │   ├── utils/
│   │   │
│   │   ├── app.js
│   │   └── server.js
│   │
│   ├── package.json
│   └── package-lock.json
│
├── frontend/
│   ├── src/
│   ├── public/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   └── package-lock.json
│
├── database/
│   ├── schema.sql
│   └── *.sql
│
├── docs/
│
├── uploads/
│
├── .env.example
├── .gitignore
└── README.md
```

### Directory Description

| Directory | Purpose |
|---|---|
| `backend/src/config` | Application and environment configuration. |
| `backend/src/controllers` | Handles incoming API requests. |
| `backend/src/middleware` | Authentication, authorization, and request processing. |
| `backend/src/modules` | Modular application functionality. |
| `backend/src/repositories` | Database access and data operations. |
| `backend/src/routes` | REST API route definitions. |
| `backend/src/services` | Business logic and external integrations. |
| `backend/src/test` | Backend automated tests. |
| `frontend/src` | React application source code. |
| `database` | SQL schema and database scripts. |
| `docs` | Project documentation. |
| `uploads` | Application upload storage. |

---

## ⚙️ Prerequisites

Install the following tools before setting up the project:

| Software | Requirement |
|---|---|
| Node.js | Version 18 or newer |
| npm | Installed with Node.js |
| PostgreSQL | Version 15 or compatible |
| Git | Latest stable version |
| Code Editor | VS Code recommended |

Optional services:

- Redis, if queue monitoring is enabled.
- SMTP credentials, if email delivery is enabled.
- Google OAuth credentials, if institutional SSO is enabled.
- External AI service credentials, if AI functionality requires them.

Check your installations:

```bash
node --version
npm --version
git --version
psql --version
```

---

## 🚀 Installation and Setup

Follow the steps below to run the project locally.

### Step 1: Clone the Repository

```bash
git clone https://github.com/omp091220-git/Collaborative-Research-Paper-Explorer.git

cd Collaborative-Research-Paper-Explorer
```

### Step 2: Configure PostgreSQL

Make sure PostgreSQL is running.

Open PostgreSQL Shell or your terminal and connect to PostgreSQL:

```bash
psql -U postgres -h localhost
```

Create the project database:

```sql
CREATE DATABASE research_explorer;
```

Exit PostgreSQL:

```sql
\q
```

Import the database schema from the project root:

```bash
psql -U postgres -h localhost -d research_explorer -f database/schema.sql
```

Enter your PostgreSQL password when prompted.

**Note:** If your repository contains additional SQL migrations required by the current version, apply them in the documented order.

### Step 3: Configure Environment Variables

The repository includes an environment configuration template.

Create your local environment file.

**Windows PowerShell:**

```powershell
Copy-Item .env.example backend/.env
```

**macOS / Linux:**

```bash
cp .env.example backend/.env
```

Open `backend/.env` and update the configuration according to your local environment.

See the [Environment Configuration](#-environment-configuration) section.

### Step 4: Install Backend Dependencies

Open a terminal at the project root:

```bash
cd backend
npm install
```

For Windows PowerShell, if script execution restrictions prevent npm from running, use:

```powershell
npm.cmd install
```

### Step 5: Install Frontend Dependencies

Open another terminal at the project root:

```bash
cd frontend
npm install
```

For Windows PowerShell:

```powershell
npm.cmd install
```

---

## 🔑 Environment Configuration

The backend requires environment variables to connect to the database and initialize application services.

Example configuration:

```env
# Server Configuration
PORT=5000
NODE_ENV=development

BACKEND_URL=http://localhost:5000
FRONTEND_URL=http://localhost:5173

# PostgreSQL Configuration
DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@localhost:5432/research_explorer

# JWT Authentication
JWT_SECRET=replace_with_a_secure_random_secret_at_least_32_characters_long

# Institutional Email Domains
ALLOWED_EMAIL_DOMAINS=dau.ac.in,university.edu

# Institutional SSO / Google OIDC
OIDC_CLIENT_ID=
OIDC_CLIENT_SECRET=
OIDC_REDIRECT_URI=http://localhost:5000/api/auth/sso/callback
OIDC_ISSUER=https://accounts.google.com
OIDC_SCOPES=openid email profile

# Session Management
SESSION_INACTIVITY_TIMEOUT_MS=1800000
SESSION_MAX_AGE_MS=28800000

# Login Rate Limiting
LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX_ATTEMPTS=5

# Password Recovery Rate Limiting
FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS=900000
FORGOT_PASSWORD_RATE_LIMIT_MAX_ATTEMPTS=5

# Email Configuration
EMAIL_SERVICE_MODE=console

SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=
SMTP_FROM="Collaborative Research Paper Explorer" <no-reply@university.edu>

# System Administrator Monitoring
STORAGE_QUOTA_MB=1024
STORAGE_WARNING_THRESHOLD_PERCENT=80
STORAGE_CRITICAL_THRESHOLD_PERCENT=90

# Redis Monitoring (Optional)
REDIS_URL=

# Development Helpers
EXPOSE_DEV_RESET_TOKEN=false
```

### Important Configuration Notes

- Replace `YOUR_PASSWORD` with your actual PostgreSQL password.
- Generate a strong JWT secret of at least 32 characters.
- Configure SMTP credentials if email delivery is required.
- Configure OAuth credentials if institutional SSO is required.
- Redis configuration is optional when Redis monitoring is not enabled.
- Additional service-specific environment variables may be required depending on the enabled modules.

**Security Warning:** Never commit `.env` files, passwords, API keys, JWT secrets, or other confidential credentials to GitHub.

---

## ▶️ Running the Application

The frontend and backend must run simultaneously.

### Terminal 1: Start the Backend

From the project root:

```bash
cd backend
npm run dev
```

Alternatively:

```bash
npm start
```

Expected backend address:

```text
http://localhost:5000
```

### Terminal 2: Start the Frontend

From the project root:

```bash
cd frontend
npm run dev
```

Vite will display the frontend development URL.

Default frontend address:

```text
http://localhost:5173
```

### Access the Application

Open your browser and visit:

```text
http://localhost:5173
```

Keep both terminal windows running while using the application.

---

## 🔌 API Overview

The backend exposes REST APIs for authentication, research paper management, annotations, and other application modules.

### Authentication APIs

Base route: `/api/auth`

| Method | Endpoint | Description |
|---|---|---|
| POST | `/register` | Register a new user. |
| POST | `/login` | Authenticate a user. |
| POST | `/logout` | Log out and invalidate the applicable session. |
| GET | `/me` | Retrieve authenticated user information. |
| POST | `/verify-email` | Verify registered email. |
| POST | `/resend-verification` | Resend verification email. |
| POST | `/forgot-password` | Initiate password recovery. |
| POST | `/reset-password` | Reset account password. |
| GET | `/sso/config` | Retrieve SSO configuration. |
| GET | `/sso/login` | Initiate institutional authentication. |
| GET | `/sso/callback` | Handle SSO callback. |

### Research Paper APIs

Base route: `/api/papers`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Retrieve available research papers. |

### Annotation APIs

Base route: `/api/annotations`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Retrieve annotations. |
| POST | `/` | Create an annotation. |
| PATCH | `/:id` | Update an annotation. |
| DELETE | `/:id` | Delete an annotation. |

**Note:** The above endpoints represent the documented API routes. Other modules may expose additional endpoints. Refer to the backend route definitions for the complete and current API implementation.

---

## 🔒 Security

Security is an important part of the application architecture.

The platform incorporates:

- JWT-based authentication.
- Password hashing using bcryptjs.
- Secure cookie handling.
- Role-Based Access Control (RBAC).
- Backend authorization middleware.
- Session expiration and revocation.
- Login and password-recovery rate limiting.
- Email verification.
- Protected API endpoints.
- Environment-based secret management.
- Access restrictions for private content.

### Session Management

The application supports configurable session management.

Default inactivity timeout:

```text
30 minutes
```

Default maximum session lifetime:

```text
8 hours
```

Session-related settings can be configured using environment variables.

---

## 🗄️ Database

PostgreSQL is used as the primary relational database.

The database stores information required for user authentication, research management, and collaboration.

Core data areas include:

- User accounts and profiles.
- Research paper metadata.
- Paper summaries.
- Research collections.
- Annotations.
- Authentication sessions.
- Related application records.

The database schema and SQL scripts are maintained inside the `database/` directory.

---

## 🧪 Testing

The backend uses the Node.js built-in test runner and Supertest for automated testing.

To run the backend test suite:

```bash
cd backend
npm test
```

Tests are intended to validate important application functionality, including:

- Authentication.
- Authorization.
- Request validation.
- API behavior.
- Core backend operations.

Refer to the backend `package.json` for the currently configured test scripts.

---

## 🌿 Git Workflow

This project uses Git and GitHub for collaborative development.

Contributors should work on separate feature branches instead of pushing directly to the `main` branch.

### 1. Clone the Repository

```bash
git clone https://github.com/omp091220-git/Collaborative-Research-Paper-Explorer.git

cd Collaborative-Research-Paper-Explorer
```

### 2. Get the Latest Changes

```bash
git checkout main
git pull origin main
```

### 3. Create a Feature Branch

```bash
git checkout -b feature/your-feature-name
```

Example:

```bash
git checkout -b feature/researcher-profile
```

### 4. Make Changes and Commit

```bash
git add .
git commit -m "Add researcher profile functionality"
```

### 5. Push Your Branch

```bash
git push -u origin feature/your-feature-name
```

### 6. Create a Pull Request

1. Open the repository on GitHub.
2. Select the Pull Requests tab.
3. Create a new pull request.
4. Select your feature branch as the source.
5. Select `main` as the target branch.
6. Describe your changes.
7. Request a review from teammates.
8. Resolve conflicts if necessary.
9. Merge after approval.

**Important:** Do not push unfinished or unreviewed changes directly to `main`.

---

## 🛠️ Troubleshooting

### 1. Missing JWT_SECRET

Error:

```text
Missing required environment variable: JWT_SECRET
```

Solution:

- Make sure `backend/.env` exists.
- Add a valid `JWT_SECRET`.
- Restart the backend server.

### 2. PostgreSQL Password Authentication Failed

Error:

```text
password authentication failed for user "postgres"
```

Solution:

- Verify your PostgreSQL username.
- Verify your PostgreSQL password.
- Make sure PostgreSQL is running.
- Check the `DATABASE_URL` inside `backend/.env`.
- Ensure the database `research_explorer` exists.

### 3. npm Execution Policy Error on Windows

Error:

```text
npm.ps1 cannot be loaded because running scripts is disabled
```

Solution:

Use:

```powershell
npm.cmd install
```

And start development scripts using:

```powershell
npm.cmd run dev
```

### 4. Port Already in Use

If the backend or frontend port is already occupied:

- Stop the process using that port.
- Alternatively, configure another available port.
- Restart the application.

### 5. Frontend Cannot Connect to Backend

Check:

- Backend server is running.
- API base URL is correctly configured.
- Frontend and backend ports are correct.
- CORS configuration allows the frontend origin.

---

## 🚀 Future Enhancements

Potential areas for further improvement include:

- More advanced AI-powered research recommendations.
- Enhanced research analytics and insights.
- Improved collaborative research workflows.
- Additional institutional integrations.
- Advanced research paper discovery.
- Improved scalability and performance.
- Expanded monitoring and reporting capabilities.

---

## 🤝 Contributing

Contributions from team members and developers are welcome.

To contribute:

1. Fork or clone the repository.
2. Create a dedicated feature branch.
3. Implement your changes.
4. Test your implementation.
5. Commit your changes with meaningful messages.
6. Push your branch.
7. Open a Pull Request for review.

Please maintain readable code, follow the existing project structure, and avoid committing confidential information.

---

## 📜 License

This project is developed as an academic software engineering project.

A specific open-source license should be added to the repository before redistribution under an open-source license.

---

## 👨‍💻 Project Repository

**GitHub:** [Collaborative Research Paper Explorer](https://github.com/omp091220-git/Collaborative-Research-Paper-Explorer)

**Developed as a collaborative academic software engineering project.**

⭐ If you find this project interesting, consider giving the repository a star!
