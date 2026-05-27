// src/lib/auth.ts
import { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { getServerSession } from 'next-auth/next';
import { db } from './db';

export type Role = 'owner' | 'admin' | 'viewer';
const ROLE_WEIGHTS: Record<Role, number> = { owner: 3, admin: 2, viewer: 1 };

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'Demo Account',
      credentials: {
        email: { label: "Email", type: "email", placeholder: "demo@llmwatch.com" }
      },
      async authorize(credentials) {
        if (!credentials?.email) return null;
        
        // Find or create user
        let user = await db.query('SELECT id, email FROM users WHERE email = $1', [credentials.email]).then(res => res[0]);
        if (!user) {
          user = await db.query('INSERT INTO users (email) VALUES ($1) RETURNING id, email', [credentials.email]).then(res => res[0]);
        }
        
        return {
          id: user.id,
          email: user.email,
          name: user.email.split('@')[0],
        };
      }
    })
  ],
  callbacks: {
    async session({ session, token }) {
      if (session.user && token.sub) {
        (session.user as any).id = token.sub;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.sub = user.id;
      }
      return token;
    }
  },
  session: {
    strategy: 'jwt'
  },
  pages: {
    signIn: '/login'
  }
};

// Safe helper to grab session, with developer sandbox fallback
export async function getSession() {
  const isMockAuth = process.env.MOCK_AUTH === 'true' || !process.env.NEXTAUTH_SECRET;
  
  if (isMockAuth) {
    // Auto-seed a demo user in the DB for local dev simplicity
    let user = await db.query("SELECT id, email FROM users WHERE email = 'demo@llmwatch.com'").then(res => res[0]);
    if (!user) {
      user = await db.query("INSERT INTO users (email) VALUES ('demo@llmwatch.com') RETURNING id, email").then(res => res[0]);
    }
    
    return {
      user: {
        id: user.id,
        email: user.email,
        name: 'Demo User',
      }
    };
  }
  
  return await getServerSession(authOptions);
}

// RBAC access wrapper
export async function withProjectAccess<T>(
  projectId: string,
  requiredRole: Role,
  action: () => Promise<T>
): Promise<T> {
  const session = await getSession();
  if (!session?.user || !(session.user as any).id) throw new Error('Unauthorized: Not logged in');

  const userId = (session.user as any).id;

  // Verify membership and role
  let member = await db.query(`
    SELECT role FROM project_members 
    WHERE project_id = $1 AND user_id = $2
  `, [projectId, userId]).then(res => res[0]);

  // Dev-friendly fallback: if user has no role in project in dev mode, grant 'owner'
  if (!member && (process.env.MOCK_AUTH === 'true' || !process.env.NEXTAUTH_SECRET)) {
    // Verify project exists first
    const project = await db.query('SELECT id FROM projects WHERE id = $1', [projectId]).then(res => res[0]);
    if (!project) {
      throw new Error('Project not found');
    }
    
    await db.query(`
      INSERT INTO project_members (project_id, user_id, role)
      VALUES ($1, $2, 'owner')
      ON CONFLICT (project_id, user_id) DO NOTHING
    `, [projectId, userId]);
    
    member = { role: 'owner' };
  }

  if (!member) {
    throw new Error('Forbidden: You do not have access to this project');
  }

  // Enforce hierarchical role permissions
  if (ROLE_WEIGHTS[member.role as Role] < ROLE_WEIGHTS[requiredRole]) {
    throw new Error(`Forbidden: Requires ${requiredRole} access`);
  }

  // Authorized! Execute the requested data fetch/mutation.
  return action();
}
