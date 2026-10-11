import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// This is the *public publishable* key only. Never place the service-role key in browser code.
// Capture an incoming recovery marker before the auth library handles and clears callback tokens.
const recoveryHash = new URLSearchParams(location.hash.replace(/^#/, ''));
const recoveryQuery = new URLSearchParams(location.search);
const openedRecoveryLink = recoveryHash.get('type') === 'recovery' || recoveryQuery.get('type') === 'recovery';
const supabase = createClient('https://rncdhwoqslcurvetbhoz.supabase.co', 'sb_publishable_CjI-Hya9NC7_jd6pMpVkGg_VbcbXP-N', {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: true }
});
const $ = id => document.getElementById(id);
const panels = ['loadingPanel', 'authPanel', 'resetPanel', 'dashboard'];
let mode = 'signin';
let recovery = openedRecoveryLink;
let accountVersion = 0;

function showPanel(id) {
  panels.forEach(panel => { $(panel).hidden = panel !== id; });
}
function status(id, message, kind = '') {
  const e = $(id);
  if (!e) return;
  e.textContent = message || '';
  e.dataset.kind = kind;
}
function errorMessage(error) {
  if (!error) return 'Something went wrong. Please try again.';
  return String(error.message || 'Something went wrong. Please try again.');
}
function setMode(nextMode) {
  mode = nextMode;
  const signingUp = nextMode === 'signup';
  $('signInTab').classList.toggle('selected', !signingUp);
  $('signUpTab').classList.toggle('selected', signingUp);
  $('signInTab').setAttribute('aria-pressed', String(!signingUp));
  $('signUpTab').setAttribute('aria-pressed', String(signingUp));
  $('authHeading').textContent = signingUp ? 'Create a LIVIRA account' : 'Welcome back';
  $('authExplainer').textContent = signingUp
    ? 'Register to prepare your account for future device management. No payment is required.'
    : 'Sign in with your LIVIRA account email and password.';
  $('nameWrap').hidden = !signingUp;
  $('passwordInput').autocomplete = signingUp ? 'new-password' : 'current-password';
  $('authSubmit').textContent = signingUp ? 'Create account' : 'Sign in';
  $('forgotPassword').hidden = signingUp;
  status('authStatus', '');
}
$('signInTab').addEventListener('click', () => setMode('signin'));
$('signUpTab').addEventListener('click', () => setMode('signup'));

$('authForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('authSubmit');
  button.disabled = true;
  status('authStatus', 'Please wait…');
  const email = $('emailInput').value.trim();
  const password = $('passwordInput').value;
  try {
    if (mode === 'signup') {
      if (password.length < 8) throw new Error('Use a password with at least 8 characters.');
      const displayName = $('nameInput').value.trim();
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: new URL('/account.html', location.origin).href,
          data: { display_name: displayName }
        }
      });
      if (error) throw error;
      $('passwordInput').value = '';
      if (data.session) {
        status('authStatus', 'Account created. Loading your dashboard…', 'ok');
        await renderAccount(data.session);
      } else {
        status('authStatus', 'Please check your email to confirm your account, then return here to sign in. If the confirmation link does not return to LIVIRA, the website redirect needs to be approved in our authentication settings.', 'ok');
      }
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      $('passwordInput').value = '';
      status('authStatus', 'Signed in successfully.', 'ok');
      await renderAccount(data.session);
    }
  } catch (error) {
    status('authStatus', errorMessage(error), 'error');
  } finally {
    button.disabled = false;
  }
});

$('forgotPassword').addEventListener('click', async () => {
  const email = $('emailInput').value.trim();
  if (!email) {
    status('authStatus', 'Enter your email address above first, then choose Forgot password.', 'error');
    return;
  }
  try {
    status('authStatus', 'Sending password reset instructions…');
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: new URL('/account.html', location.origin).href
    });
    if (error) throw error;
    status('authStatus', 'If this email belongs to a LIVIRA account, password reset instructions will be sent. Check your inbox and spam folder.', 'ok');
  } catch (error) {
    status('authStatus', errorMessage(error), 'error');
  }
});

$('resetForm').addEventListener('submit', async event => {
  event.preventDefault();
  const password = $('newPassword').value;
  const confirmation = $('confirmPassword').value;
  if (password !== confirmation) {
    status('resetStatus', 'The two passwords do not match. Please try again.', 'error');
    return;
  }
  if (password.length < 8) {
    status('resetStatus', 'Use a password with at least 8 characters.', 'error');
    return;
  }
  const button = $('resetForm').querySelector('button');
  button.disabled = true;
  try {
    const { data: verifiedSession, error: sessionCheckError } = await supabase.auth.getSession();
    if (sessionCheckError || !verifiedSession.session) {
      throw new Error('The reset link did not establish a valid session. Please request a fresh reset link and open it in Safari.');
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
    $('newPassword').value = '';
    $('confirmPassword').value = '';
    recovery = false;
    const { data, error: sessionError } = await supabase.auth.getSession();
    if (sessionError) throw sessionError;
    await renderAccount(data.session);
    status('dashboardStatus', 'Password updated successfully.', 'ok');
  } catch (error) {
    status('resetStatus', errorMessage(error), 'error');
  } finally {
    button.disabled = false;
  }
});

$('changePassword').addEventListener('click', () => {
  recovery = true;
  accountVersion++;
  status('resetStatus', '');
  showPanel('resetPanel');
});
$('cancelReset').addEventListener('click', async () => {
  recovery = false;
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session) {
    showPanel('authPanel');
    status('authStatus', 'Please sign in to continue.', 'error');
    return;
  }
  await renderAccount(data.session);
});
$('deviceClaimForm').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('deviceClaimSubmit');
  const virtualMac = $('claimVirtualMac').value.trim().toUpperCase();
  const shortKey = $('claimDeviceKey').value.trim().toUpperCase();
  const nickname = $('claimNickname').value.trim();
  button.disabled = true;
  status('deviceClaimStatus', 'Verifying your device securely…');
  try {
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw authError || new Error('Please sign in again.');
    const { data, error } = await supabase.rpc('livira_claim_customer_device', {
      p_virtual_mac: virtualMac,
      p_short_key: shortKey,
      p_nickname: nickname || null
    });
    if (error) throw error;
    if (!data?.linked) throw new Error('We could not complete device linking. Please try again.');
    $('claimDeviceKey').value = '';
    await renderAccount((await supabase.auth.getSession()).data.session);
    status('deviceClaimStatus', data.alreadyLinked
      ? 'This device is already linked to your account.'
      : 'Device linked successfully. Your TV playlist remains unchanged.', 'ok');
  } catch (error) {
    // Clear the secret after every attempt; customers can re-enter it if needed.
    $('claimDeviceKey').value = '';
    status('deviceClaimStatus', errorMessage(error), 'error');
  } finally {
    button.disabled = false;
  }
});

$('signOut').addEventListener('click', async () => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    recovery = false;
    showPanel('authPanel');
    status('authStatus', 'Signed out.', 'ok');
  } catch (error) {
    status('dashboardStatus', errorMessage(error), 'error');
  }
});

async function ensureProfile(user) {
  let { data, error } = await supabase
    .from('livira_customer_accounts')
    .select('id,display_name')
    .eq('id', user.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) {
    const displayName = typeof user.user_metadata?.display_name === 'string'
      ? user.user_metadata.display_name.slice(0, 100) : null;
    const created = await supabase.from('livira_customer_accounts')
      .insert({ id: user.id, display_name: displayName }).select('id,display_name').single();
    if (created.error) {
      // A second signed-in tab may have created the same profile.
      const retried = await supabase.from('livira_customer_accounts')
        .select('id,display_name').eq('id', user.id).maybeSingle();
      if (retried.error || !retried.data) throw created.error;
      data = retried.data;
    } else {
      data = created.data;
    }
  }
  return data;
}
function formatDay(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? 'Not scheduled' :
    new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(d);
}
function planNode(plan) {
  const el = document.createElement('article');
  el.className = 'plan-box';
  const name = document.createElement('b');
  name.textContent = plan.name;
  const cost = document.createElement('strong');
  cost.textContent = plan.annual_price_cents === 0 ? 'Free'
    : new Intl.NumberFormat('en-US', { style: 'currency', currency: plan.currency || 'USD' })
      .format(plan.annual_price_cents / 100);
  const count = document.createElement('small');
  count.textContent = 'Up to ' + plan.max_devices + (plan.max_devices === 1 ? ' device' : ' devices') + (plan.annual_price_cents ? ' · per year' : '');
  const state = document.createElement('em');
  state.textContent = plan.annual_price_cents ? 'PAID ACTIVATION COMING SOON' : 'FREE-LAUNCH PREVIEW';
  el.append(name, cost, count, state);
  return el;
}
function deviceNode(device) {
  const el = document.createElement('div');
  el.className = 'device-row';
  const name = document.createElement('strong');
  name.textContent = device.nickname || 'LIVIRA device';
  const state = document.createElement('span');
  state.textContent = device.status === 'active' ? 'Active assignment' : 'Inactive';
  el.append(name, state);
  return el;
}

async function renderAccount(session) {
  const version = ++accountVersion;
  if (!session?.user) { showPanel('authPanel'); return; }
  if (recovery) { showPanel('resetPanel'); return; }
  showPanel('loadingPanel');
  try {
    // Verify the signed-in user with Supabase rather than trusting a local profile id.
    const { data: authData, error: authError } = await supabase.auth.getUser();
    if (authError || !authData.user) throw authError || new Error('Sign in again to continue.');
    const user = authData.user;
    const [profile, subscriptionsResult, devicesResult, plansResult] = await Promise.all([
      ensureProfile(user),
      supabase.from('livira_customer_subscriptions')
        .select('plan_code,status,starts_at,expires_at,created_at')
        .order('created_at', { ascending: false }).limit(10),
      supabase.from('livira_customer_devices')
        .select('id,nickname,status,activated_at').eq('status', 'active'),
      supabase.from('livira_license_plans')
        .select('code,name,max_devices,annual_price_cents,currency,is_checkout_enabled')
        .eq('is_public', true)
        .order('annual_price_cents', { ascending: true })
    ]);
    if (version !== accountVersion || recovery) {
      if (recovery) showPanel('resetPanel');
      return;
    }
    if (subscriptionsResult.error) throw subscriptionsResult.error;
    if (devicesResult.error) throw devicesResult.error;
    if (plansResult.error) throw plansResult.error;
    const subscriptions = subscriptionsResult.data || [];
    const devices = devicesResult.data || [];
    const plans = plansResult.data || [];
    const subscription = subscriptions.find(s => ['active', 'trial'].includes(s.status)
      && (!s.expires_at || new Date(s.expires_at) > new Date()));
    const licensedPlan = plans.find(p => p.code === subscription?.plan_code);
    $('accountEmail').textContent = user.email || 'Signed in';
    $('profileEmail').value = user.email || '';
    $('profileName').value = profile.display_name || '';
    $('currentPlan').textContent = subscription ? (licensedPlan?.name || subscription.plan_code) : 'No active plan';
    $('planStatus').textContent = subscription ? subscription.status : 'Free-launch preview';
    $('deviceUsage').textContent = devices.length + (devices.length === 1 ? ' device' : ' devices');
    $('deviceLimit').textContent = subscription && licensedPlan
      ? 'Plan allowance: up to ' + licensedPlan.max_devices + ' devices'
      : 'Early access: 1 linked device';
    $('renewalDate').textContent = subscription?.expires_at ? formatDay(subscription.expires_at) : 'Not scheduled';
    const list = $('deviceList');
    list.replaceChildren();
    if (!devices.length) {
      const empty = document.createElement('p');
      empty.className = 'account-muted';
      empty.textContent = 'No devices are linked to this customer account yet. Existing TV playlists remain unchanged.';
      list.append(empty);
    } else devices.forEach(device => list.append(deviceNode(device)));
    const grid = $('plansGrid');
    grid.replaceChildren();
    if (!plans.length) {
      const none = document.createElement('p');
      none.className = 'account-muted';
      none.textContent = 'Plan information is unavailable right now.';
      grid.append(none);
    } else plans.forEach(plan => grid.append(planNode(plan)));
    showPanel('dashboard');
    $('profileForm').onsubmit = async event => {
      event.preventDefault();
      const name = $('profileName').value.trim();
      const button = $('profileForm').querySelector('button');
      button.disabled = true;
      try {
        const { error } = await supabase.from('livira_customer_accounts')
          .update({ display_name: name || null, updated_at: new Date().toISOString() })
          .eq('id', user.id);
        if (error) throw error;
        status('profileStatus', 'Profile saved.', 'ok');
      } catch (error) {
        status('profileStatus', errorMessage(error), 'error');
      } finally {
        button.disabled = false;
      }
    };
  } catch (error) {
    if (version !== accountVersion) return;
    showPanel('authPanel');
    status('authStatus', 'Account dashboard unavailable: ' + errorMessage(error), 'error');
  }
}

// Respond to auth and recovery links. Keep async Supabase work outside the auth-state callback.
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY') {
    recovery = true;
    accountVersion++; // invalidate dashboard requests already in flight
    showPanel('resetPanel');
    return;
  }
  if (event === 'SIGNED_OUT') {
    accountVersion++;
    recovery = false;
    showPanel('authPanel');
    return;
  }
  if (event === 'SIGNED_IN' && session && !recovery) {
    setTimeout(() => { renderAccount(session); }, 0);
  }
});
const { data, error } = await supabase.auth.getSession();
if (error) {
  showPanel('authPanel');
  status('authStatus', errorMessage(error), 'error');
} else {
  await renderAccount(data.session);
}
