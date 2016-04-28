import React, {Component, PropTypes} from 'react'
import {reduxForm} from 'redux-form'
import registerValidation from './RegisterValidation'

import Alert from 'react-bootstrap/lib/Alert'

import { Input } from 'components'

// TODO async validation on username
@reduxForm({
  form: 'register',
  fields: ['username', 'password'],
  validate: registerValidation
})

export default class RegisterForm extends Component {
  static propTypes = {
    fields: PropTypes.object.isRequired,
    invalid: PropTypes.bool.isRequired,
    pristine: PropTypes.bool.isRequired,
    submitting: PropTypes.bool.isRequired,
    handleSubmit: PropTypes.func.isRequired,
    register: PropTypes.func.isRequired,
    unmount: PropTypes.func,
    fail: PropTypes.object
  }

  componentWillUnmount() {
    this.props.unmount()
  }

  render() {
    const { handleSubmit, register, fail, fields: {username, password}, pristine, invalid, submitting } = this.props

    return (
      <form onSubmit={handleSubmit(register)}>
        {fail && fail.id &&
        <Alert bsStyle="danger">
          {fail.id === 'UsernameTakenError' &&
          <div><strong>Woops!</strong> Username is already taken</div>}
        </Alert>}

        <div>
          <Input object={username} label="Username" size="lg" focus />
          <Input object={password} label="Password" size="lg" type="password" />
        </div>
        <button type="submit" className="btn btn-complete" disabled={pristine || invalid || submitting}>
          <i className="fa fa-sign-in"/>
          {submitting ? ' Registering...' : ' Register'}
        </button>
      </form>
    )
  }
}