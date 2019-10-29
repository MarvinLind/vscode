pipeline {
	agent {
    kubernetes {
      label 'vscode'
      defaultContainer 'jnlp'
      yaml """
apiVersion: v1
kind: Pod
spec:
  containers:
  - name: yarn-build
    image: jlarfors/vscode:latest
    command:
    - cat
    tty: true
"""
    }
  }
  stages {
    stage('Build') {
      steps {
        container('yarn-build') {
					sh '''
					yarn
					yarn compile
					'''
        }
      }
    }
  }
}
