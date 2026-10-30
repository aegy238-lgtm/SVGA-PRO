import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PLATFORM_SETTINGS,
  INITIAL_SUPER_ADMIN_ACCOUNT,
  INITIAL_USERS,
  UserAccount,
  applyUserBanAction,
  canBanUserAccount,
  evaluatePlatformAccessBlock,
  generateDeterministicNetworkId,
  getEffectiveUserNetworkId,
  isNetworkIdBanned,
  isUserAccountBanned,
} from './platformStore';

test('generateDeterministicNetworkId produces consistent NET-XXXX-XXXX identifiers', () => {
  const netA = generateDeterministicNetworkId('usr_demo_free');
  const netB = generateDeterministicNetworkId('usr_demo_free');
  const netC = generateDeterministicNetworkId('usr_demo_pro');

  assert.match(netA, /^NET-[0-9A-F]{4}-[0-9A-F]{4}$/);
  assert.equal(netA, netB);
  assert.notEqual(netA, netC);
});

test('canBanUserAccount protects Super Admin and enforces role permissions', () => {
  const superAdmin = INITIAL_SUPER_ADMIN_ACCOUNT;
  const regularUser = INITIAL_USERS.find((u) => u.id === 'usr_demo_free')!;
  const delegatedAdmin: UserAccount = {
    id: 'usr_sub_admin',
    name: 'Sub Admin',
    email: 'sub@svga-pro.com',
    role: 'admin',
    adminPermissions: ['manage_users'],
    isPro: true,
    createdAt: '2026-10-26T00:00:00.000Z',
  };

  // Super Admin can ban regular users and delegated admins, but never themselves
  assert.equal(canBanUserAccount(superAdmin, regularUser), true);
  assert.equal(canBanUserAccount(superAdmin, delegatedAdmin), true);
  assert.equal(canBanUserAccount(superAdmin, superAdmin), false);

  // Delegated admin with manage_users can ban regular users, but NOT Super Admin or other admins
  assert.equal(canBanUserAccount(delegatedAdmin, regularUser), true);
  assert.equal(canBanUserAccount(delegatedAdmin, superAdmin), false);
  assert.equal(canBanUserAccount(delegatedAdmin, delegatedAdmin), false);

  // Regular user cannot ban anyone
  assert.equal(canBanUserAccount(regularUser, regularUser), false);
});

test('applyUserBanAction bans account, bans network, revokes privileges, and unbans cleanly', () => {
  const baseSettings = { ...DEFAULT_PLATFORM_SETTINGS };
  const baseUsers = INITIAL_USERS.map((u) => ({ ...u }));
  const targetUser = baseUsers.find((u) => u.id === 'usr_demo_pro')!;
  const targetNetId = getEffectiveUserNetworkId(targetUser);

  // 1. Account Ban (حظر حساب)
  const accountBanRes = applyUserBanAction({
    users: baseUsers,
    settings: baseSettings,
    targetUserId: targetUser.id,
    banAccount: true,
    banNetwork: false,
    reason: 'مخالفة الشروط',
    nowIso: '2026-10-30T10:00:00.000Z',
  });

  assert.equal(accountBanRes.updatedUser?.isBanned, true);
  assert.equal(accountBanRes.updatedUser?.networkBanned, false);
  assert.equal(accountBanRes.updatedUser?.isPro, false);
  assert.equal(isUserAccountBanned(accountBanRes.updatedUser, accountBanRes.settings), true);
  assert.equal(isNetworkIdBanned(targetNetId, accountBanRes.settings, accountBanRes.users), false);

  // 2. Network Ban (حظر شبكة وحساب نهائي)
  const networkBanRes = applyUserBanAction({
    users: accountBanRes.users,
    settings: accountBanRes.settings,
    targetUserId: targetUser.id,
    banAccount: true,
    banNetwork: true,
    reason: 'حظر شبكة نهائي',
    nowIso: '2026-10-30T10:05:00.000Z',
  });

  assert.equal(networkBanRes.updatedUser?.isBanned, true);
  assert.equal(networkBanRes.updatedUser?.networkBanned, true);
  assert.equal(isNetworkIdBanned(targetNetId, networkBanRes.settings, networkBanRes.users), true);
  assert.ok(networkBanRes.settings.bannedNetworkIds?.includes(targetNetId));

  // 3. Unban (فك الحظر)
  const unbanRes = applyUserBanAction({
    users: networkBanRes.users,
    settings: networkBanRes.settings,
    targetUserId: targetUser.id,
    banAccount: false,
    banNetwork: false,
  });

  assert.equal(unbanRes.updatedUser?.isBanned, false);
  assert.equal(unbanRes.updatedUser?.networkBanned, false);
  assert.equal(isUserAccountBanned(unbanRes.updatedUser, unbanRes.settings), false);
  assert.equal(isNetworkIdBanned(targetNetId, unbanRes.settings, unbanRes.users), false);
});

test('evaluatePlatformAccessBlock blocks banned accounts and banned networks while keeping Super Admin immune', () => {
  const baseSettings = { ...DEFAULT_PLATFORM_SETTINGS };
  const baseUsers = INITIAL_USERS.map((u) => ({ ...u }));
  const freeUser = baseUsers.find((u) => u.id === 'usr_demo_free')!;
  const freeNetId = getEffectiveUserNetworkId(freeUser);

  const netBannedState = applyUserBanAction({
    users: baseUsers,
    settings: baseSettings,
    targetUserId: freeUser.id,
    banAccount: true,
    banNetwork: true,
  });

  // Guest visitor from the banned network ID is completely blocked from the platform
  const guestOnBannedNet = evaluatePlatformAccessBlock({
    currentUser: null,
    settings: netBannedState.settings,
    users: netBannedState.users,
    clientNetworkId: freeNetId,
  });
  assert.equal(guestOnBannedNet.blocked, true);
  assert.equal(guestOnBannedNet.blockType, 'network');

  // Super Admin on the same browser remains unblocked unless previewBlockMode is enabled
  const superAdminOnBannedNet = evaluatePlatformAccessBlock({
    currentUser: INITIAL_SUPER_ADMIN_ACCOUNT,
    settings: netBannedState.settings,
    users: netBannedState.users,
    clientNetworkId: freeNetId,
  });
  assert.equal(superAdminOnBannedNet.blocked, false);

  // Super Admin previewing the network ban screen sees the preview lockdown
  const superAdminPreview = evaluatePlatformAccessBlock({
    currentUser: INITIAL_SUPER_ADMIN_ACCOUNT,
    settings: netBannedState.settings,
    users: netBannedState.users,
    clientNetworkId: freeNetId,
    previewBlockMode: 'network',
  });
  assert.equal(superAdminPreview.blocked, true);
  assert.equal(superAdminPreview.isPreview, true);

  // When Admin unbans the user's network, both the user and their network can enter the platform again immediately
  const unbannedState = applyUserBanAction({
    users: netBannedState.users,
    settings: netBannedState.settings,
    targetUserId: freeUser.id,
    banAccount: false,
    banNetwork: false,
  });

  // Verify no undefined fields exist on updatedUser (Firestore setDoc compatibility)
  assert.equal(
    Object.values(unbannedState.updatedUser || {}).some((val) => val === undefined),
    false
  );

  const userAfterUnban = evaluatePlatformAccessBlock({
    currentUser: unbannedState.updatedUser,
    settings: unbannedState.settings,
    users: unbannedState.users,
    clientNetworkId: freeNetId,
  });
  assert.equal(userAfterUnban.blocked, false);
  assert.equal(userAfterUnban.blockType, null);

  const guestAfterUnban = evaluatePlatformAccessBlock({
    currentUser: null,
    settings: unbannedState.settings,
    users: unbannedState.users,
    clientNetworkId: freeNetId,
  });
  assert.equal(guestAfterUnban.blocked, false);
  assert.equal(guestAfterUnban.blockType, null);
});

