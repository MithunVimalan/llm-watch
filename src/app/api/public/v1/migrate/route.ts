// src/app/api/public/v1/migrate/route.ts
import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    // Read the schema.sql script from the root workspace
    const schemaPath = path.join(process.cwd(), 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      return NextResponse.json({ 
        success: false, 
        error: 'schema.sql file not found in project root' 
      }, { status: 404 });
    }

    const sqlScript = fs.readFileSync(schemaPath, 'utf8');

    // node-postgres Pool.query accepts multi-statement SQL scripts directly
    await db.query(sqlScript);

    return NextResponse.json({
      success: true,
      message: 'Schema migrations executed successfully. Database initialized and seeded.'
    });
  } catch (err: any) {
    console.error('Database migration fatal error:', err);
    return NextResponse.json({
      success: false,
      error: err.message || 'Migration execution failed'
    }, { status: 500 });
  }
}
