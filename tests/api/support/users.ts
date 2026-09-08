export type SigninUser = {
  id: string;
  phone_no: string;
  otp: string;
  first_name: string;
  last_name: string;
  permission: string;
};

// api-main's in-memory user data (server.js) is fixed and read-only: two
// known users, ids "001" and "002". Shared here instead of each spec file
// declaring its own copy.
export const USER_001: SigninUser = {
  id: '001',
  phone_no: '020011893',
  otp: '123456',
  first_name: 'John',
  last_name: 'Doe',
  permission: 'admin',
};

export const USER_002: SigninUser = {
  id: '002',
  phone_no: '020011894',
  otp: '654321',
  first_name: 'Jane',
  last_name: 'Smith',
  permission: 'user',
};

export const KNOWN_USER_IDS: string[] = [USER_001.id, USER_002.id];
