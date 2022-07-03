#!/bin/sh

echo "starting"
log_file_path="$PWD/vds-angular.log"

# make sure the log file exists
rm $log_file_path
touch $log_file_path
# chmod u+w $log_file_path
chmod 777 $log_file_path

echo $(ls -al $PWD)

echo "WHOAMI: $(whoami)"
search_term="Built Angular Package"

session_name=$(tmux display-message -p '#S')
echo "session name: $session_name"
# tmux new-session -ds $session_name -c $PWD

# Server
tmux neww -t $session_name -n server
tmux send-keys -t $session_name:server "npm run lib:watch 2>&1 | tee $log_file_path" Enter

# https://superuser.com/questions/270529/monitoring-a-file-until-a-string-is-found
wait_str() {
  echo "wait str"
  local file="$1"; shift
  echo "Search Term $1"
  local search_term="$1"; shift
  local wait_time="${1:-5m}"; shift # 5 minutes as default Timeout

  echo "looking for $search_term in $file: $PWD"
  (timeout $wait_time tail -F "$file" &) | grep -q "$search_term" && return 0

  echo "Timeout of $wait_time reached. Unable to find '$search_term' in '$file'"
  return 1
}

wait_server() {
  echo "Waiting for server... $1"

  local server_log="$1"; shift
  local wait_time="$1"; shift

  wait_file "$server_log" 10 || { echo "Server log file missing: $server_log"; return 1; }
  wait_str "$server_log" "$search_term" "$wait_time"
}

wait_file() {
  echo "wait file"

  local file="$1"; shift
  local wait_seconds="${1:-10}"; shift # 10 seconds as default timeout

  until $file $((wait_seconds--)) -eq 0 -o -f $file ; do sleep 1; done

  echo "does this line ever fire?"
  ((++wait_seconds))
}

wait_server $log_file_path 10s && echo -n $search_term

# remove log file
rm $log_file_path

