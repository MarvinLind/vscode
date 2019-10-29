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
    image: marvinlind/vscode-gulp
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
					npm install -g gulp
					yarn
					yarn compile
					'''
        }
      }
    }
		stage('Package') {
      steps {
        container('yarn-build') {
					sh 'gulp vscode-linux-x64'
        }
      }
    }
  }
}
