const AUTH_ERROR_MESSAGES = Object.freeze({
  'auth/email-already-in-use': 'このメールアドレスは別のアカウントで使用されています。復旧ログインを選んでください。',
  'auth/credential-already-in-use': 'このメールアドレスは別のアカウントで使用されています。復旧ログインを選んでください。',
  'auth/invalid-email': 'メールアドレスの形式が正しくありません。',
  'auth/weak-password': 'パスワードは6文字以上で設定してください。',
  'auth/invalid-credential': 'メールアドレスまたはパスワードが正しくありません。',
  'auth/wrong-password': 'メールアドレスまたはパスワードが正しくありません。',
  'auth/missing-password': 'パスワードを入力してください。',
  'auth/user-disabled': 'このアカウントは現在利用できません。',
  'auth/too-many-requests': '試行回数が多すぎます。時間をおいてから再度お試しください。',
  'auth/network-request-failed': '通信できませんでした。接続を確認して再度お試しください。',
  'auth/provider-already-linked': 'このアカウントにはすでに復旧設定があります。',
  'auth/requires-recent-login': '安全のため再ログインが必要です。',
  'auth/operation-not-allowed': 'Firebase Authenticationで「メール/パスワード」を有効にしてください。',
});

export function accountErrorMessage(error) {
  return AUTH_ERROR_MESSAGES[error?.code] ?? error?.message ?? 'アカウント処理に失敗しました。';
}
