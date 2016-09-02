"use strict"

module.exports = PaymentsControllerFactory

const _ = require('lodash')
const request = require('five-bells-shared/utils/request')
const Auth = require('../lib/auth')
const Log = require('../lib/log')
const Ledger = require('../lib/ledger')
const SPSP = require('../lib/spsp')
const Config = require('../lib/config')
const Socket = require('../lib/socket')
const Utils = require('../lib/utils')
const UserFactory = require('../models/user')
const PaymentFactory = require('../models/payment')
const InvalidLedgerAccountError = require('../errors/invalid-ledger-account-error')
const LedgerInsufficientFundsError = require('../errors/ledger-insufficient-funds-error')

PaymentsControllerFactory.constitute = [Auth, PaymentFactory, Log, Ledger, Config, Utils, SPSP, Socket, UserFactory]
function PaymentsControllerFactory (Auth, Payment, log, ledger, config, utils, spsp, socket, User) {
  log = log('payments')

  return class PaymentsController {
    static init(router) {
      router.get('/payments', Auth.checkAuth, this.getHistory)
      router.post('/payments/quote', Auth.checkAuth, this.quote)
      router.put('/payments/:id', Auth.checkAuth, Payment.createBodyParser(), this.putResource)

      router.post('/receivers/:username', this.setup)
    }

    /**
     * @api {get} /payments User payments history
     * @apiName GetPayments
     * @apiGroup Payment
     * @apiVersion 1.0.0
     *
     * @apiDescription Get user payments history
     *
     * @apiParam {String} page Current page number
     * @apiParam {String} limit Number of payments
     *
     * @apiExample {shell} Get last 2 payments
     *    curl -X GET -H "Authorization: Basic YWxpY2U6YWxpY2U="
     *    https://wallet.example/payments?page=1&limit=2
     *
     * @apiSuccessExample {json} 200 Response:
     *    HTTP/1.1 200 OK
     *    {
     *      "list": [
     *        {
     *          "id": "15a3cbb8-d0f3-410e-8a59-14e8dee14abd",
     *          "source_user": 1,
     *          "source_account": "https://wallet.example/ledger/accounts/alice",
     *          "destination_user": 2,
     *          "destination_account": "https://wallet.example/ledger/accounts/bob",
     *          "transfer": "https://wallet.example/ledger/transfers/3d4c9c8e-204a-4213-9e91-88b64dad8604",
     *          "state": null,
     *          "source_amount": "12",
     *          "destination_amount": "12",
     *          "created_at": "2016-04-19T20:18:18.040Z",
     *          "completed_at": null,
     *          "updated_at": "2016-04-19T20:18:18.040Z",
     *          "sourceUserUsername": "alice",
     *          "destinationUserUsername": "bob"
     *        },
     *        {
     *          "id": "e1d3c588-807c-4d4f-b25c-61842b5ead6d",
     *          "source_user": 1,
     *          "source_account": "https://wallet.example/ledger/accounts/alice",
     *          "destination_user": 2,
     *          "destination_account": "https://wallet.example/ledger/accounts/bob",
     *          "transfer": "https://wallet.example/ledger/transfers/d1fa49d3-c955-4833-803a-df0c43eab044",
     *          "state": null,
     *          "source_amount": "1",
     *          "destination_amount": "1",
     *          "created_at": "2016-04-19T20:15:57.055Z",
     *          "completed_at": null,
     *          "updated_at": "2016-04-19T20:15:57.055Z",
     *          "sourceUserUsername": "alice",
     *          "destinationUserUsername": "bob"
     *        }
     *      ],
     *      "totalPages": 5
     *    }
     */
    static * getHistory() {
      const page = this.query.page
      const limit = this.query.limit

      const payments = yield Payment.getUserPayments(this.req.user, page, limit)

      this.body = {
        list: payments.rows,
        totalPages: Math.ceil(payments.count / limit)
      }
    }

    /**
     * @api {put} /payments/:id Make payment
     * @apiName PutPayments
     * @apiGroup Payment
     * @apiVersion 1.0.0
     *
     * @apiDescription Make payment
     *
     * @apiParam {String} id generated payment uuid
     * @apiParam {String} destination_account destination account
     * @apiParam {String} source_amount source amount
     * @apiParam {String} destination_amount destination amount
     * @apiParam {String} source_memo memo for the source
     * @apiParam {String} destination_memo memo for the destination
     * @apiParam {String} message text message for the destination
     * @apiParam {String} quote quote
     *
     * @apiExample {shell} Make a payment with the destination_amount
     *    curl -X PUT -H "Authorization: Basic YWxpY2U6YWxpY2U=" -H "Content-Type: application/json" -d
     *    '{
     *        "destination_account": "bob@wallet.example",
     *        "destination_amount": "1"
     *    }'
     *    https://wallet.example/payments/9efa70ec-08b9-11e6-b512-3e1d05defe78
     *
     * @apiSuccessExample {json} 200 Response:
     *    HTTP/1.1 200 OK
     */

    // TODO handle payment creation. Shouldn't rely on notification service
    static * putResource() {
      const _this = this

      let id = _this.params.id
      request.validateUriParameter('id', id, 'Uuid')
      id = id.toLowerCase()
      let payment = this.body

      payment.id = id
      payment.source_user = this.req.user.id

      const destination = yield utils.parseDestination({
        destination: payment.destination
      })

      // Interledger payment
      const transfer = yield spsp.pay({
        source: this.req.user,
        destination: destination,
        sourceAmount: payment.sourceAmount,
        destinationAmount: payment.destinationAmount,
        memo: payment.message
      })

      // If the payment is local the receiver already created it in the db
      let dbPayment = yield Payment.findOne({
        where: {execution_condition: transfer.executionCondition}
      })

      if (!dbPayment) {
        dbPayment = new Payment()
      }

      dbPayment.setDataExternal({
        source_user: this.req.user.id,
        destination_account: destination.accountUri,
        source_amount: payment.sourceAmount,
        destination_amount: payment.destinationAmount,
        transfer: transfer.uuid,
        message: payment.message,
        execution_condition: transfer.executionCondition,
        state: 'success'
      })
      dbPayment.save()

      // Notify the clients
      socket.payment(this.req.user.username, dbPayment)

      log.debug('Ledger transfer payment ID ' + id)

      // TODO should be something more meaningful
      this.status = 200
    }

    /**
     * @api {POST} /payments/quote Request a quote
     * @apiName Quote
     * @apiGroup Payment
     * @apiVersion 1.0.0
     *
     * @apiDescription Request a quote
     *
     * @apiParam {String} destination destination
     * @apiParam {String} source_amount source amount
     * @apiParam {String} destination_amount destination amount
     *
     * @apiExample {shell} Request a quote
     *    curl -X POST -H "Authorization: Basic YWxpY2U6YWxpY2U=" -H "Content-Type: application/json" -d
     *    '{
     *        "destination": "bob@wallet.example",
     *        "destination_amount": "10"
     *    }'
     *    https://wallet.example/payments/quote
     *
     * @apiSuccessExample {json} 200 Response:
     *    HTTP/1.1 200 OK
     *    {
     *      "sourceAmount": "10",
     *      "destinationAmount": "10"
     *    }
     */

    // TODO handle not supplied params
    static * quote() {
      const destination = yield utils.parseDestination({
        destination: this.body.destination
      })

      this.body = yield spsp.quote({
        source: this.req.user,
        destination: destination,
        sourceAmount: this.body.source_amount,
        destinationAmount: this.body.destination_amount
      })
    }

    static * setup() {
      const sourceAccount = this.body.sender_identifier
      const memo = this.body.memo
      const destinationAmount = this.body.amount

      // Get the user from the db. We need the id in the payment
      const destinationUser = yield User.findOne({
        where: {username: this.params.username}
      })

      // Requested user doesn't exist
      if (!destinationUser) {
        return this.status = 404
      }

      const paymentParams = yield spsp.createRequest(destinationUser, destinationAmount)

      const paymentObj = {
        state: 'pending',
        source_account: sourceAccount,
        destination_user: destinationUser.id,
        destination_amount: destinationAmount,
        message: memo,
        execution_condition: paymentParams.condition
      }

      // Create the payment object
      const payment = new Payment()
      payment.setDataExternal(paymentObj)

      try {
        yield payment.create()

        this.body = paymentParams
      } catch (e) {
        console.log('payments:299', 'woops', e)
        // TODO handle
      }
    }
  }
}
