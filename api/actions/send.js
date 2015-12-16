import { transfer } from '../ledger';

export default function send(req) {
  const options = {
    recipient: req.body.recipient,
    amount: req.body.amount,
    username: req.session.user.name,
    password: req.session.user.password
  }
  return transfer(options)
}
