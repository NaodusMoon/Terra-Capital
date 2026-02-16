import type { Pool, PoolClient } from "pg";
import type { AppUser, SellerVerificationStatus } from "@/types/auth";
import { getPostgresPool } from "@/lib/server/postgres";

type DbClient = Pool | PoolClient;

interface DbUserRow {
  id: string;
  full_name: string;
  organization: string | null;
  stellar_public_key: string;
  seller_verification_status: SellerVerificationStatus;
  seller_verification_data: AppUser["sellerVerificationData"] | null;
  created_at: string;
  updated_at: string;
}

export function mapDbUser(row: DbUserRow): AppUser {
  return {
    id: row.id,
    fullName: row.full_name,
    organization: row.organization ?? undefined,
    stellarPublicKey: row.stellar_public_key,
    sellerVerificationStatus: row.seller_verification_status,
    sellerVerificationData: row.seller_verification_data ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getClient(client?: DbClient) {
  return client ?? getPostgresPool();
}

export async function findUserByWallet(walletAddress: string, client?: DbClient) {
  const db = getClient(client);
  const result = await db.query<DbUserRow>(
    `SELECT id, full_name, organization, stellar_public_key, seller_verification_status, seller_verification_data, created_at, updated_at
     FROM app_users
     WHERE stellar_public_key = $1
     LIMIT 1`,
    [walletAddress],
  );
  if (result.rowCount === 0) return null;
  return mapDbUser(result.rows[0]);
}
