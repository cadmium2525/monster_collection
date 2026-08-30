const AUTH_ERROR_MESSAGES = Object.freeze({
  'auth/email-already-in-use': 'この復旧IDはすでに使用されています。別のIDを選ぶか、既存アカウントの復旧を選んでください。',
  'auth/credential-already-in-use': 'この復旧IDはすでに使用されています。別のIDを選ぶか、既存アカウントの復旧を選んでください。',
  'auth/invalid-email': '復旧IDの形式が正しくありません。',
  'auth/weak-password': 'パスワードは6文字以上で設定してください。',
  'auth/invalid-credential': '復旧IDまたはパスワードが正しくありません。',
  'auth/wrong-password': '復旧IDまたはパスワードが正しくありません。',
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
